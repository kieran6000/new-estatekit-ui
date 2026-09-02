import { callApi } from "./_client";
import type { FormAnswer, LeadPage, PipelineKind } from "../types";

export async function listLeadPages(): Promise<LeadPage[]> {
  return callApi<LeadPage[]>("leadPages.list");
}

export async function addLeadPage(name: string, pipelineId: string, kind: PipelineKind): Promise<LeadPage> {
  return callApi<LeadPage>("leadPages.add", { name, pipelineId, kind });
}

export async function updateLeadPage(id: string, patch: Partial<Omit<LeadPage, "id" | "pipelineId">>): Promise<void> {
  await callApi("leadPages.update", { id, patch });
}

/** A short, shareable public URL. Purely client-side — no backend call. */
export function shortLinkFor(page: Pick<LeadPage, "name" | "agentName">): string {
  const slug = (page.agentName || page.name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return "ek.co/p/" + (slug || "agent");
}

// Public submission — no session/token. The backend resolves which client's
// spreadsheet owns this pageId via its own PageIndex lookup.
export async function submitMockLead(
  pageId: string,
  name: string,
  phone: string,
  formAnswers: FormAnswer[],
  email: string | null = null,
) {
  return callApi("leadPages.submitMockLead", { pageId, name, phone, formAnswers, email });
}
