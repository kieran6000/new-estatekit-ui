import { callApi } from "./_client";
import type { FormAnswer, LeadRow } from "../types";

export async function listLeads(): Promise<LeadRow[]> {
  return callApi<LeadRow[]>("leads.list");
}

export async function updateLead(id: string, patch: Partial<LeadRow>): Promise<void> {
  await callApi("leads.update", { id, patch });
}

export async function createLeadFromSubmission(
  name: string,
  phone: string,
  formAnswers: FormAnswer[],
  pipelineId: string,
  sourcePageId: string | null,
  email: string | null = null,
): Promise<LeadRow> {
  return callApi<LeadRow>("leads.create", { name, phone, formAnswers, pipelineId, sourcePageId, email });
}
