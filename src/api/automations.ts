import { supabase, getCurrentUserId } from "./_client";
import type { AutomationRow, AutomationStepRow } from "../types/automations";

/** Emergency stop: disable every automation and cancel all pending/in-flight runs. Operators only. */
export async function panicStopAutomations(): Promise<{ cancelled: number }> {
  const { data, error } = await supabase.functions.invoke("panic-automations", { body: {} });
  if (error) throw new Error(data?.error || error.message);
  if (data?.error) throw new Error(data.error);
  return { cancelled: data?.cancelled ?? 0 };
}

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

export interface ScheduledRun {
  id: string;
  run_at: string;
  status: "pending" | "processing" | "paused";
  current_step: number;
  /** One-off wording for this lead's next message; null = the automation's default. */
  template_override: string | null;
  automation_id: string;
  lead: { id: string; name: string; phone: string; stage: string; next_label: string; agent_id: string };
}

export interface ScheduledRunPatch {
  status?: "pending" | "paused" | "cancelled";
  run_at?: string;
  template_override?: string | null;
}

/** Queued and paused automation runs for one account's leads, soonest first. */
export async function listScheduledRuns(agentId: string): Promise<ScheduledRun[]> {
  const { data, error } = await supabase
    .from("automation_runs")
    .select("id, run_at, status, current_step, template_override, automation_id, lead:leads!inner(id, name, phone, stage, next_label, agent_id)")
    .eq("lead.agent_id", agentId)
    .in("status", ["pending", "processing", "paused"])
    .order("run_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ScheduledRun[];
}

export async function updateScheduledRun(id: string, patch: ScheduledRunPatch): Promise<void> {
  const { error } = await supabase.from("automation_runs").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getAccountAutomationsPaused(agentId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("agent_profiles")
    .select("automations_paused")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.automations_paused === true;
}

/** Pause or resume every automation for one account. Queued messages are held
 *  (or released) too, so the list reflects it straight away. */
export async function setAccountAutomationsPaused(agentId: string, paused: boolean): Promise<void> {
  const { error } = await supabase.from("agent_profiles").update({ automations_paused: paused }).eq("agent_id", agentId);
  if (error) throw new Error(error.message);

  const runs = await listScheduledRuns(agentId);
  const ids = runs.filter((r) => r.status === (paused ? "pending" : "paused")).map((r) => r.id);
  if (!ids.length) return;
  const { error: runError } = await supabase
    .from("automation_runs")
    .update({ status: paused ? "paused" : "pending" })
    .in("id", ids);
  if (runError) throw new Error(runError.message);
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
