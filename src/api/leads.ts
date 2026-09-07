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

export async function setLeadArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await supabase.from("leads").update({ archived }).eq("id", id);
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
