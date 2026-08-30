import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as setupStepsApi from "../api/setupSteps";
import type { SetupStepRow } from "../types";

const STEPS_KEY = ["setupSteps"] as const;

export function useSetupSteps() {
  return useQuery({
    queryKey: STEPS_KEY,
    queryFn: async (): Promise<SetupStepRow[]> => {
      const rows = await setupStepsApi.listSetupSteps();
      return [...rows].sort((a, b) => a.sort_order - b.sort_order);
    },
  });
}

export function useMarkStepDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await setupStepsApi.markStepDone(id);
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: STEPS_KEY });
      const prev = qc.getQueryData<SetupStepRow[]>(STEPS_KEY);
      qc.setQueryData<SetupStepRow[]>(STEPS_KEY, (old) =>
        old?.map((s) => (s.id === id ? { ...s, done: true } : s)),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(STEPS_KEY, ctx.prev);
    },
  });
}
