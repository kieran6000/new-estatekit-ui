export type TriggerType = "lead_created" | "stage_changed" | "reminder_due";
export type ActionType = "send_whatsapp" | "set_reminder" | "set_stage";

export interface AutomationRow {
  id: string;
  name: string;
  trigger_type: TriggerType;
  trigger_stage: string | null;
  enabled: boolean;
  created_at: string;
}

export interface AutomationStepRow {
  id: string;
  automation_id: string;
  step_order: number;
  delay_minutes: number;
  action_type: ActionType;
  template_text: string | null;
  payload: Record<string, unknown>;
}
