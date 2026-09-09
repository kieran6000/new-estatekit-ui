import { supabase } from "./_client";
import type { LeadRow, PipelineKind, Stage } from "../types";

/** Log an outcome using only the share token — works when the agent isn't
 *  signed in (the WhatsApp action-link case). */
export async function logOutcomeByToken(token: string, stage: Stage): Promise<void> {
  const { data, error } = await supabase.functions.invoke("log-outcome", {
    body: { token, stage },
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

export async function getLeadByToken(
  token: string,
): Promise<{ lead: LeadRow; agentPhone: string; pipelineKind: PipelineKind } | null> {
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
