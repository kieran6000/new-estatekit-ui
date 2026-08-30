import { getStore, setStore } from "./_store";
import type { AutomationRow, AutomationStepRow } from "../types/automations";

const AUTOMATIONS_KEY = "automations";
const STEPS_KEY = "automation_steps";

function seedAutomations(): AutomationRow[] {
  return [
    { id: "auto-1", name: "New lead ping", trigger_type: "lead_created", trigger_stage: null, enabled: true, created_at: new Date().toISOString() },
    { id: "auto-2", name: "No-answer retry", trigger_type: "stage_changed", trigger_stage: "No Answer", enabled: true, created_at: new Date().toISOString() },
    { id: "auto-3", name: "Follow-up sequence", trigger_type: "stage_changed", trigger_stage: "Contacted", enabled: true, created_at: new Date().toISOString() },
    { id: "auto-4", name: "Appointment reminder", trigger_type: "stage_changed", trigger_stage: "Booked", enabled: false, created_at: new Date().toISOString() },
  ];
}

function seedSteps(): AutomationStepRow[] {
  return [
    { id: "step-1", automation_id: "auto-1", step_order: 1, delay_minutes: 0, action_type: "send_whatsapp", template_text: "New lead: {{name}} ({{phone}}) just came in.", payload: {} },
    { id: "step-2", automation_id: "auto-2", step_order: 1, delay_minutes: 240, action_type: "send_whatsapp", template_text: "Still no answer from {{first_name}} — try again?", payload: {} },
    { id: "step-3", automation_id: "auto-3", step_order: 1, delay_minutes: 2880, action_type: "send_whatsapp", template_text: "Time to follow up with {{first_name}}.", payload: {} },
    { id: "step-4", automation_id: "auto-3", step_order: 2, delay_minutes: 4320, action_type: "set_reminder", template_text: null, payload: { label: "in 3 days", offset_minutes: 4320, due: true } },
    { id: "step-5", automation_id: "auto-4", step_order: 1, delay_minutes: 1440, action_type: "send_whatsapp", template_text: "Appointment with {{first_name}} is coming up.", payload: {} },
  ];
}

// TODO: connect backend — replace with a real agent_profiles.is_operator lookup.
export async function getIsOperator(): Promise<boolean> {
  return true;
}

// TODO: connect backend — replace with a real `select * from automations` call.
export async function listAutomations(): Promise<AutomationRow[]> {
  return getStore<AutomationRow[]>(AUTOMATIONS_KEY, seedAutomations());
}

// TODO: connect backend — replace with a real `select * from automation_steps` call.
export async function listAutomationSteps(): Promise<AutomationStepRow[]> {
  return getStore<AutomationStepRow[]>(STEPS_KEY, seedSteps());
}

// TODO: connect backend — replace with a real `update automations set enabled = ...` call.
export async function toggleAutomation(id: string, enabled: boolean): Promise<void> {
  const rows = await listAutomations();
  setStore(AUTOMATIONS_KEY, rows.map((a) => (a.id === id ? { ...a, enabled } : a)));
}

// TODO: connect backend — replace with a real `update automation_steps set ...` call.
export async function updateAutomationStep(step: Pick<AutomationStepRow, "id" | "delay_minutes" | "template_text" | "payload">): Promise<void> {
  const rows = await listAutomationSteps();
  setStore(
    STEPS_KEY,
    rows.map((s) => (s.id === step.id ? { ...s, delay_minutes: step.delay_minutes, template_text: step.template_text, payload: step.payload } : s)),
  );
}
