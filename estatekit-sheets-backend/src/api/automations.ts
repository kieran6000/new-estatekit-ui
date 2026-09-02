import { callApi } from "./_client";
import type { AutomationRow, AutomationStepRow } from "../types/automations";

export async function getIsOperator(): Promise<boolean> {
  return callApi<boolean>("automations.getIsOperator");
}

export async function listAutomations(): Promise<AutomationRow[]> {
  return callApi<AutomationRow[]>("automations.list");
}

export async function listAutomationSteps(): Promise<AutomationStepRow[]> {
  return callApi<AutomationStepRow[]>("automations.listSteps");
}

export async function toggleAutomation(id: string, enabled: boolean): Promise<void> {
  await callApi("automations.toggle", { id, enabled });
}

export async function updateAutomationStep(
  step: Pick<AutomationStepRow, "id" | "delay_minutes" | "template_text" | "payload">,
): Promise<void> {
  await callApi("automations.updateStep", { step });
}
