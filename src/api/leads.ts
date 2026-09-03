import { supabase, getCurrentUserId, getActiveAgentId } from "./_client";
import type { FormAnswer, LeadRow } from "../types";

export async function listLeads(): Promise<LeadRow[]> {
  const agentId = await getActiveAgentId();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as LeadRow[];
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
