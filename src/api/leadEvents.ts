import { supabase, getCurrentUserId } from "./_client";

export type LeadEventType =
  | "created" | "stage_changed" | "note_changed" | "archived" | "restored"
  | "pipeline_moved" | "call" | "whatsapp_sent";

export type LeadEventSource =
  | "dashboard" | "action_link" | "automation" | "facebook" | "website" | "system" | "backfill";

export interface LeadEvent {
  id: string;
  lead_id: string;
  agent_id: string | null;
  /** Who did it. Null for system writes (sync, automation, backfill). */
  actor_id: string | null;
  event_type: LeadEventType;
  from_value: string | null;
  to_value: string | null;
  source: LeadEventSource;
  /** Browser user agent the change came from, when known. */
  device: string | null;
  created_at: string;
}

/** A lead's full history, newest first. Operator-only (enforced by RLS). */
export async function listLeadEvents(leadId: string): Promise<LeadEvent[]> {
  const { data, error } = await supabase
    .from("lead_events")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeadEvent[];
}

const NO_SESSION = "00000000-0000-0000-0000-000000000000";

/** Record a Call tap from the signed-in dashboard. Fire-and-forget — a history
 *  entry must never get in the way of actually dialling. */
export function logLeadCall(leadId: string, agentId: string): void {
  getCurrentUserId()
    .then((uid) => {
      if (uid === NO_SESSION) return;
      return supabase.from("lead_events").insert({
        lead_id: leadId,
        agent_id: agentId,
        actor_id: uid,
        event_type: "call",
        source: "dashboard",
      });
    })
    .catch(() => {});
}

/** Record a Call tap from a signed-out WhatsApp action link. */
export function logCallByToken(token: string): void {
  supabase.functions.invoke("lead-call", { body: { token } }).catch(() => {});
}
