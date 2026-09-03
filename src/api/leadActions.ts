import { supabase } from "./_client";
import type { LeadRow } from "../types";

export async function getLeadByToken(
  token: string,
): Promise<{ lead: LeadRow; agentPhone: string } | null> {
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

  return { lead: lead as LeadRow, agentPhone: profile?.whatsapp_number ?? "" };
}
