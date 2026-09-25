import { supabase } from "./_client";
import type { LeadRow, PipelineKind, Stage } from "../types";

/** Log an outcome using only the share token — works when the agent isn't
 *  signed in (the WhatsApp action-link case). */
export async function logOutcomeByToken(token: string, stage: Stage, at?: string | null): Promise<void> {
  const { data, error } = await supabase.functions.invoke("log-outcome", {
    // `at` is the appointment time for Booked / Viewing Booked. Without it the
    // server has no date to store and the appointment can never appear in a
    // diary — which is exactly what was happening.
    body: { token, stage, at: at ?? null },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
}

/** Save a lead's note using only the share token (signed-out action link). */
export async function saveNoteByToken(token: string, note: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("lead-note", {
    body: { token, note },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
}

type SharedLead = { lead: LeadRow; agentPhone: string; pipelineKind: PipelineKind };

/**
 * Everything the /l/<token> page needs, for exactly one lead, in one call.
 *
 * Used to be four anonymous table reads, which only worked because three
 * policies made every lead with a live token readable to anyone, token or
 * not (see supabase/migrations/20260925_0001). get_shared_lead checks the
 * token server-side and returns only that lead.
 */
export async function getLeadByToken(token: string): Promise<SharedLead | null> {
  const { data, error } = await supabase.rpc("get_shared_lead", { p_token: token });
  if (!error) {
    if (!data) return null;
    const d = data as { lead: LeadRow; agent_phone?: string; pipeline_kind?: PipelineKind };
    return { lead: d.lead, agentPhone: d.agent_phone ?? "", pipelineKind: d.pipeline_kind ?? "seller" };
  }
  // PGRST202: the function isn't in the database yet. Fall back to the old
  // reads so the site and the migration can ship in either order. Delete this
  // fallback once 20260925_0002 has run: the reads it relies on are gone then.
  if (error.code === "PGRST202") return getLeadByTokenLegacy(token);
  return null;
}

async function getLeadByTokenLegacy(token: string): Promise<SharedLead | null> {
  const { data: tokenRow, error } = await supabase
    .from("lead_share_tokens")
    .select("lead_id, agent_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !tokenRow) return null;
  if (new Date(tokenRow.expires_at) < new Date()) return null;

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", tokenRow.lead_id)
    .maybeSingle();

  if (!lead) return null;

  const { data: profile } = await supabase
    .from("agent_profiles")
    .select("whatsapp_number")
    .eq("agent_id", tokenRow.agent_id)
    .maybeSingle();

  // The outcome options differ for buyer vs seller leads, and a signed-out
  // visitor can't load the agent's pipeline list — so resolve the kind here.
  // Pipelines are publicly readable, so this works without a session.
  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("kind")
    .eq("id", (lead as LeadRow).pipeline_id)
    .maybeSingle();

  return {
    lead: lead as LeadRow,
    agentPhone: profile?.whatsapp_number ?? "",
    pipelineKind: (pipeline?.kind as PipelineKind) ?? "seller",
  };
}
