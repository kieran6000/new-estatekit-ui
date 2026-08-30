import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as leadPageApi from "../api/leadPageConfig";
import type { LeadPageConfig } from "../types";

const KEY = ["leadPageConfig"] as const;

export function useLeadPageConfig() {
  return useQuery({
    queryKey: KEY,
    queryFn: leadPageApi.getLeadPageConfig,
  });
}

export function useSaveLeadPageConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: LeadPageConfig) => {
      await leadPageApi.saveLeadPageConfig(config);
      return config;
    },
    onSuccess: (config) => qc.setQueryData(KEY, config),
  });
}

export function useSubmitMockLead() {
  return useMutation({
    mutationFn: async ({ name, phone, address }: { name: string; phone: string; address: string }) =>
      leadPageApi.submitMockLead(name, phone, address),
  });
}
