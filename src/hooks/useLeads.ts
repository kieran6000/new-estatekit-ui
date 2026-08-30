import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as leadsApi from "../api/leads";
import { computeStagePatch } from "../lib/stageLogic";
import type { LeadRow, Stage, StageChangeExtra } from "../types";

const LEADS_KEY = ["leads"] as const;

export function useLeads() {
  return useQuery({
    queryKey: LEADS_KEY,
    queryFn: async (): Promise<LeadRow[]> => {
      const rows = await leadsApi.listLeads();
      return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });
}

export function useLead(id: string | undefined) {
  const { data: leads } = useLeads();
  return leads?.find((l) => l.id === id);
}

interface StageChangeArgs {
  id: string;
  stage: Stage;
  extra?: StageChangeExtra | number;
  /** false to skip the SOP side-effects (next_label/due/reminder_at/commission) */
  applySOP?: boolean;
  /** Exact fields to write instead of computing them — used to fully restore
   * a lead's prior state on Undo (computeStagePatch alone can't do that,
   * since it derives fields from the new stage, not the old snapshot). */
  override?: Partial<Pick<LeadRow, "next_label" | "due" | "reminder_at" | "commission">>;
}

function resolvePatch({ stage, extra, applySOP = true, override }: StageChangeArgs) {
  if (override) return override;
  return applySOP ? computeStagePatch(stage, extra) : {};
}

/** Optimistically updates the cached lead list, patches the mock store, rolls back on failure. */
export function useUpdateLeadStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: StageChangeArgs) => {
      const patch = resolvePatch(args);
      await leadsApi.updateLead(args.id, { stage: args.stage, ...patch });
      return { id: args.id, stage: args.stage, patch };
    },
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: LEADS_KEY });
      const prev = qc.getQueryData<LeadRow[]>(LEADS_KEY);
      const patch = resolvePatch(args);
      qc.setQueryData<LeadRow[]>(LEADS_KEY, (old) =>
        old?.map((l) => (l.id === args.id ? { ...l, stage: args.stage, ...patch } : l)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(LEADS_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: LEADS_KEY });
    },
  });
}

export function useUpdateLeadNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      await leadsApi.updateLead(id, { note });
    },
    onMutate: async ({ id, note }) => {
      await qc.cancelQueries({ queryKey: LEADS_KEY });
      const prev = qc.getQueryData<LeadRow[]>(LEADS_KEY);
      qc.setQueryData<LeadRow[]>(LEADS_KEY, (old) => old?.map((l) => (l.id === id ? { ...l, note } : l)));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(LEADS_KEY, ctx.prev);
    },
  });
}
