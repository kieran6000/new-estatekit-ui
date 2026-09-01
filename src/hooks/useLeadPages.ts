import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as leadPagesApi from "../api/leadPages";
import type { FormAnswer, LeadPage, PipelineKind } from "../types";

const KEY = ["leadPages"] as const;

export function useLeadPages() {
  return useQuery({
    queryKey: KEY,
    queryFn: leadPagesApi.listLeadPages,
  });
}

export function useAddLeadPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, pipelineId, kind }: { name: string; pipelineId: string; kind: PipelineKind }) =>
      leadPagesApi.addLeadPage(name, pipelineId, kind),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateLeadPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Omit<LeadPage, "id" | "pipelineId">> }) =>
      leadPagesApi.updateLeadPage(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSubmitMockLead() {
  return useMutation({
    mutationFn: async ({ pageId, name, phone, formAnswers }: { pageId: string; name: string; phone: string; formAnswers: FormAnswer[] }) =>
      leadPagesApi.submitMockLead(pageId, name, phone, formAnswers),
  });
}
