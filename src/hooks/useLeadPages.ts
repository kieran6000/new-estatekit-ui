import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as leadPagesApi from "../api/leadPages";
import { trackActivity } from "../lib/activity";
import type { FormAnswer, LeadPage, PipelineKind } from "../types";

const KEY = ["leadPages"] as const;

export function useLeadPages(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: KEY,
    queryFn: leadPagesApi.listLeadPages,
    enabled: opts?.enabled,
    staleTime: 2 * 60_000,
  });
}

export function useAddLeadPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, pipelineId, kind, sourceType, fbFormId, fbFormName, fbPageId }: {
      name: string; pipelineId: string; kind: PipelineKind;
      sourceType?: "website" | "fb_form"; fbFormId?: string; fbFormName?: string; fbPageId?: string | null;
    }) =>
      leadPagesApi.addLeadPage(name, pipelineId, kind, { sourceType, fbFormId, fbFormName, fbPageId }),
    onSuccess: async (page) => {
      trackActivity("lead_page_created", { page: { name: page.name, slug: page.slug } });
      await qc.invalidateQueries({ queryKey: KEY });
    },
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

export function useDeleteLeadPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leadPagesApi.deleteLeadPage(id),
    onSuccess: async () => {
      trackActivity("lead_page_deleted", {});
      await qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useSubmitMockLead() {
  return useMutation({
    mutationFn: async ({
      pageId,
      name,
      phone,
      formAnswers,
      email,
    }: {
      pageId: string;
      name: string;
      phone: string;
      formAnswers: FormAnswer[];
      email?: string | null;
    }) => leadPagesApi.submitMockLead(pageId, name, phone, formAnswers, email ?? null),
  });
}
