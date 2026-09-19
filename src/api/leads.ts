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
