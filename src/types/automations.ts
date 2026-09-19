export type TriggerType =
  | "lead_created"
  | "stage_changed"
  | "reminder_due"
  // Not per-lead like the others: one message per agent on a daily schedule
  // (the end-of-day "leads still to update" nudge). It doesn't create
  // automation_runs — the edge function reads this row's enabled flag and its
  // step's template directly.
  | "daily_digest";
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
