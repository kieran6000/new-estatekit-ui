import { supabase, getCurrentUserId } from "./_client";

export type LeadEventType =
  | "created" | "stage_changed" | "note_changed" | "archived" | "restored"
  | "pipeline_moved" | "call" | "whatsapp_sent"
  | "email_sent"
  | "email_failed"
  | "email_delivered"
  | "email_delayed"
  | "email_bounced"
  | "email_complained"
  | "email_opened"
  | "email_clicked"
  | "plan_opened";

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

export interface EmailStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  spam: number;
  planOpened: number;
}

/** Confirmation email results for one agent: the number of LEADS with each
 *  outcome in the last `days` days (not raw event counts). Operators only
 *  (lead history is operator-readable). */
export async function getEmailStats(agentId: string, days = 30, range?: { since: Date; until: Date }): Promise<EmailStats> {
  const since = (range?.since ?? new Date(Date.now() - days * 864e5)).toISOString();
  let q = supabase
    .from("lead_events")
    .select("lead_id, event_type")
    .eq("agent_id", agentId)
    .or("event_type.like.email_%,event_type.eq.plan_opened")
    .gte("created_at", since);
  if (range) q = q.lt("created_at", range.until.toISOString());
  const { data, error } = await q.limit(5000);
  if (error) throw new Error(error.message);
  const leads = (t: string) => new Set((data ?? []).filter((r) => r.event_type === t).map((r) => r.lead_id)).size;
  return {
    sent: leads("email_sent"),
    delivered: leads("email_delivered"),
    opened: leads("email_opened"),
    clicked: leads("email_clicked"),
    bounced: leads("email_bounced"),
    failed: leads("email_failed"),
    spam: leads("email_complained"),
    planOpened: leads("plan_opened"),
  };
}
