import { supabase, getCurrentUserId, getActiveAgentId } from "./_client";
import { computeStagePatch } from "../lib/stageLogic";
import type { FormAnswer, LeadRow, Stage } from "../types";

export async function listLeads(): Promise<LeadRow[]> {
  const agentId = await getActiveAgentId();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("agent_id", agentId)
    .eq("archived", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as LeadRow[];
}

/** One lead by id, whichever account it belongs to (RLS decides: an agent
 *  gets only their own, an operator any). Used when a link points at a lead
 *  that isn't in the account currently on screen. */
export async function getLeadById(id: string): Promise<LeadRow | null> {
  const { data, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LeadRow) ?? null;
}

/** Archived leads are kept but stay out of the working list. */
export async function listArchivedLeads(): Promise<LeadRow[]> {
  const agentId = await getActiveAgentId();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("agent_id", agentId)
    .eq("archived", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as LeadRow[];
}

/** A lead found by the operator-wide search, with enough context to tell two
 *  same-named leads on different accounts apart. */
export interface LeadSearchHit extends LeadRow {
  agent_name: string;
  pipeline_name: string;
}

/**
 * Search every lead the caller can see, across all accounts, by name, phone or
 * email. For operators this is the whole database — RLS is what scopes it, so
 * a normal agent running the same query just gets their own leads back.
 *
 * Phone matching ignores spaces and punctuation on both sides, because nobody
 * types a number the way it was stored ("082 000 0000" vs "+27820000000").
 */
export async function searchLeadsEverywhere(query: string): Promise<LeadSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const digits = q.replace(/\D/g, "");

  // PostgREST `or` takes a comma-separated filter list; commas inside a value
  // would split it, so they're stripped from the search term.
  const safe = q.replace(/[,()]/g, " ").trim();
  const clauses = [`name.ilike.*${safe}*`, `email.ilike.*${safe}*`];
  // Only treat it as a phone search once there are enough digits to be one —
  // otherwise "07" matches half the database.
  if (digits.length >= 4) clauses.push(`phone.ilike.*${digits}*`);

  const { data, error } = await supabase
    .from("leads")
    .select("*, pipeline:pipelines(name)")
    .or(clauses.join(","))
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as (LeadRow & { pipeline: { name: string } | null })[];

  // Stored numbers aren't normalised, so a digits-only query can miss rows
  // whose phone has spaces in it. Re-filter client side to catch those.
  const matched = rows.filter((l) => {
    if (l.name?.toLowerCase().includes(safe.toLowerCase())) return true;
    if (l.email?.toLowerCase().includes(safe.toLowerCase())) return true;
    return digits.length >= 4 && (l.phone ?? "").replace(/\D/g, "").includes(digits);
  });

  const names = await agentNameMap([...new Set(matched.map((l) => l.agent_id))]);
  return matched.map((l) => ({
    ...l,
    agent_name: names.get(l.agent_id) ?? "Unknown account",
    pipeline_name: l.pipeline?.name ?? "",
  }));
}

async function agentNameMap(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await supabase
    .from("agent_profiles")
    .select("agent_id, display_name, company")
    .in("agent_id", ids);
  return new Map((data ?? []).map((p) => [p.agent_id, p.display_name || p.company || "Unknown account"]));
}

/**
 * Mark a lead's commission as actually banked (or undo it).
 *
 * Tolerates the column not existing yet, same as the custom-question writes:
 * the Overview simply reports nothing as earned until the migration is applied,
 * which is still more truthful than counting a signed mandate as money in.
 */
export async function setCommissionReceived(id: string, received: boolean): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ commission_received_at: received ? new Date().toISOString() : null })
    .eq("id", id);
  if (!error) return;
  const m = error.message.toLowerCase();
  if (m.includes("schema cache") || m.includes("commission_received_at")) {
    console.warn("commission_received_at column not present — run the pending migration", error.message);
    throw new Error("Not set up yet");
  }
  throw new Error(error.message);
}

export async function setLeadArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await supabase.from("leads").update({ archived }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Apply the same patch to many leads at once (operator bulk actions). */
export async function bulkUpdateLeads(ids: string[], patch: Partial<LeadRow>): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from("leads").update(patch).in("id", ids);
  if (error) throw new Error(error.message);
}

/** Move a lead into a different pipeline (operator action).
 *
 *  When the target pipeline is a different kind, the stage is translated to its
 *  equivalent there and the matching SOP patch applied — otherwise the lead
 *  would sit on a stage that pipeline has no option for. */
export async function moveLeadToPipeline(
  id: string,
  pipelineId: string,
  nextStage?: Stage,
): Promise<void> {
  const patch: Record<string, unknown> = { pipeline_id: pipelineId };
  if (nextStage) Object.assign(patch, { stage: nextStage }, computeStagePatch(nextStage));
  const { error } = await supabase.from("leads").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export interface SourceAd {
  id: string;
  name: string;
  status: string;
  body: string;
  headline: string;
  imageUrl: string;
  cta: string;
  link: string;
  postUrl: string;
}

const BOOKED_STAGES = ["Booked", "Viewing Booked", "Mandate Signed"];
const MANDATE_STAGE = "Mandate Signed";
export type AdLeadMetric = "leads" | "booked" | "mandates";

/** The leads some Facebook ads brought in between two days, newest first: all
 *  of them, or those booked or signed, by the stage they're in now or any move
 *  into one. Counts them the way the ads table's Booked and Mandates columns do. */
export async function listLeadIdsForAds(agentId: string, adIds: string[], since: string, until: string, metric: AdLeadMetric = "leads"): Promise<string[]> {
  if (!adIds.length) return [];
  const leads: { id: string; stage: string; created_at: string }[] = [];
  const end = new Date(`${until}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  for (let i = 0; i < adIds.length; i += 200) {
    let q = supabase.from("leads").select("id, stage, created_at").eq("agent_id", agentId).in("fb_ad_id", adIds.slice(i, i + 200));
    q = metric === "leads"
      ? q.gte("created_at", `${since}T00:00:00+02:00`).lte("created_at", `${until}T23:59:59.999+02:00`)
      : q.gte("created_at", `${since}T00:00:00Z`).lt("created_at", end.toISOString());
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    leads.push(...((data ?? []) as typeof leads));
  }
  leads.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  if (metric === "leads") return leads.map((l) => l.id);
  const wanted = metric === "booked" ? BOOKED_STAGES : [MANDATE_STAGE];
  const hit = new Set(leads.filter((l) => wanted.includes(l.stage)).map((l) => l.id));
  const ids = leads.map((l) => l.id);
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await supabase.from("lead_events").select("lead_id").in("lead_id", ids.slice(i, i + 300)).eq("event_type", "stage_changed").in("to_value", wanted);
    if (error) throw new Error(error.message);
    for (const e of data ?? []) hit.add(e.lead_id as string);
  }
  return ids.filter((id) => hit.has(id));
}

export interface UnlinkedResults {
  booked: number;
  mandates: number;
  /** Why no ad is known, for those booked or signed. */
  imported: number;
  page: number;
  form: number;
}

/** Booked and signed leads in these dates with no ad recorded, so the ads
 *  table can't count them (the leads bar does). Same dates and rules as the
 *  table's Booked and Mandates columns (fb-adset-table's ekResults). */
export async function unlinkedResults(agentId: string, since: string, until: string): Promise<UnlinkedResults> {
  const end = new Date(`${until}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const { data, error } = await supabase.from("leads").select("id, stage, fb_lead_id, source_page_id")
    .eq("agent_id", agentId).is("fb_ad_id", null)
    .gte("created_at", `${since}T00:00:00Z`).lt("created_at", end.toISOString()).range(0, 9999);
  if (error) throw new Error(error.message);
  const leads = (data ?? []) as { id: string; stage: string; fb_lead_id: string | null; source_page_id: string | null }[];
  const booked = new Set(leads.filter((l) => BOOKED_STAGES.includes(l.stage)).map((l) => l.id));
  const signed = new Set(leads.filter((l) => l.stage === MANDATE_STAGE).map((l) => l.id));
  const ids = leads.map((l) => l.id);
  for (let i = 0; i < ids.length; i += 300) {
    const { data: ev, error: e2 } = await supabase.from("lead_events").select("lead_id, to_value").in("lead_id", ids.slice(i, i + 300)).eq("event_type", "stage_changed").in("to_value", BOOKED_STAGES);
    if (e2) throw new Error(e2.message);
    for (const e of ev ?? []) { booked.add(e.lead_id as string); if (e.to_value === MANDATE_STAGE) signed.add(e.lead_id as string); }
  }
  const hit = leads.filter((l) => booked.has(l.id));
  return {
    booked: booked.size,
    mandates: signed.size,
    imported: hit.filter((l) => !l.fb_lead_id && !l.source_page_id).length,
    page: hit.filter((l) => !!l.source_page_id).length,
    form: hit.filter((l) => !!l.fb_lead_id && !l.source_page_id).length,
  };
}

/** The Facebook ad this lead came from, resolved from its fb_lead_id. */
export async function getLeadSourceAd(leadId: string): Promise<SourceAd | null> {
  const { data, error } = await supabase.functions.invoke("fb-lead-source-ad", { body: { leadId } });
  if (error) throw new Error(error.message);
  return (data?.ad ?? null) as SourceAd | null;
}

export async function updateLead(
  id: string,
  patch: Partial<LeadRow>,
): Promise<void> {
  const { error } = await supabase.from("leads").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createLeadFromSubmission(
  name: string,
  phone: string,
  formAnswers: FormAnswer[],
  pipelineId: string,
  sourcePageId: string | null,
  email: string | null = null,
): Promise<LeadRow> {
  const agentId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("leads")
    .insert({
      agent_id: agentId,
      name,
      phone,
      email,
      form_answers: formAnswers,
      pipeline_id: pipelineId,
      source_page_id: sourcePageId,
      stage: "New Lead",
      next_label: "Just came in",
      due: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as LeadRow;
}
