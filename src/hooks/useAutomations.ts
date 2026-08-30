import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as automationsApi from "../api/automations";
import type { AutomationRow, AutomationStepRow } from "../types/automations";

const AUTOMATIONS_KEY = ["automations"] as const;
const STEPS_KEY = ["automationSteps"] as const;

export function useIsOperator() {
  return useQuery({
    queryKey: ["isOperator"],
    queryFn: automationsApi.getIsOperator,
  });
}

export function useAutomations() {
  return useQuery({
    queryKey: AUTOMATIONS_KEY,
    queryFn: async (): Promise<AutomationRow[]> => {
      const rows = await automationsApi.listAutomations();
      return [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
  });
}

export function useAutomationSteps() {
  return useQuery({
    queryKey: STEPS_KEY,
    queryFn: async (): Promise<AutomationStepRow[]> => {
      const rows = await automationsApi.listAutomationSteps();
      return [...rows].sort((a, b) => a.step_order - b.step_order);
    },
  });
}

export function useToggleAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await automationsApi.toggleAutomation(id, enabled);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: AUTOMATIONS_KEY }),
  });
}

export function useUpdateAutomationStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (step: Pick<AutomationStepRow, "id" | "delay_minutes" | "template_text" | "payload">) => {
      await automationsApi.updateAutomationStep(step);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STEPS_KEY }),
  });
}
