import { supabase, getCurrentUserId } from "./_client";
import type { AutomationRow, AutomationStepRow } from "../types/automations";

export async function getIsOperator(): Promise<boolean> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("agent_profiles")
    .select("is_operator")
    .eq("agent_id", userId)
    .single();
  if (error) return false;
  return data?.is_operator === true;
}

export async function listAutomations(): Promise<AutomationRow[]> {
  const { data, error } = await supabase
    .from("automations")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data as AutomationRow[];
}

export async function listAutomationSteps(): Promise<AutomationStepRow[]> {
  const { data, error } = await supabase
    .from("automation_steps")
    .select("*")
    .order("step_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data as AutomationStepRow[];
}

export async function toggleAutomation(
  id: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("automations")
    .update({ enabled })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateAutomationStep(
  step: Pick<
    AutomationStepRow,
    "id" | "delay_minutes" | "template_text" | "payload"
  >,
): Promise<void> {
  const { error } = await supabase
    .from("automation_steps")
    .update({
      delay_minutes: step.delay_minutes,
      template_text: step.template_text,
      payload: step.payload,
    })
    .eq("id", step.id);
  if (error) throw new Error(error.message);
}
