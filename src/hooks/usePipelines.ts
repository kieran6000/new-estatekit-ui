import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as pipelinesApi from "../api/pipelines";
import type { PipelineKind } from "../types";

const KEY = ["pipelines"] as const;

export function usePipelines(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: KEY,
    queryFn: pipelinesApi.listPipelines,
    enabled: opts?.enabled,
  });
}

export function useAddPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, kind }: { name: string; kind: PipelineKind }) => pipelinesApi.addPipeline(name, kind),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
