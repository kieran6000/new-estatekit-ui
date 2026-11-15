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
  | "plan_opened"
  | "plan_pdf_opened"
  | "workflow_email"
  | "workflow_email_opened"
  | "tagged"
  | "email_unsubscribed"
  | "capi_reported"
  | "call_time_set"
  | "resubmitted"
  | "video_watched";

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

/** A small write that must never get in the way of dialling. The tap opens the
 *  phone's dialer at once, which can cut the request off: so if it fails, it
 *  goes again when the agent comes back to the page (three tries in all). A
 *  lost call log made an agent look like they never phoned (speed to lead,
 *  "still waiting for your call" nudges). */
function tryUntilSaved(write: () => Promise<boolean>): void {
  let left = 3;
  const go = async () => {
    left--;
    let ok = false;
    try {
      ok = await write();
    } catch {
      ok = false;
    }
    if (ok || left <= 0) return;
    if (document.visibilityState === "visible") {
      setTimeout(() => void go(), 4000);
      return;
    }
    const back = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", back);
      void go();
    };
    document.addEventListener("visibilitychange", back);
  };
  void go();
}

/** Record a Call tap from the signed-in dashboard. Fire-and-forget — a history
 *  entry must never get in the way of actually dialling. */
export function logLeadCall(leadId: string, agentId: string): void {
  // Its id is chosen here, so a second try of a save that did get through is
  // refused as a duplicate (23505) instead of counting the call twice.
  const id = crypto.randomUUID();
  tryUntilSaved(async () => {
    const uid = await getCurrentUserId();
    if (uid === NO_SESSION) return true;
    const { error } = await supabase.from("lead_events").insert({
      id,
      lead_id: leadId,
      agent_id: agentId,
      actor_id: uid,
      event_type: "call",
      source: "dashboard",
    });
    return !error || error.code === "23505";
  });
}

/** Record a Call tap from a signed-out WhatsApp action link. Tried again only
 *  when no answer came back at all (cut off as the dialer opened); an answer,
 *  even an error, means the server had it. */
export function logCallByToken(token: string): void {
  tryUntilSaved(async () => {
    const { error } = await supabase.functions.invoke("lead-call", { body: { token } });
    return !error || error.name === "FunctionsHttpError";
  });
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
    .select("lead_id, event_type, from_value")
    .eq("agent_id", agentId)
    .or("event_type.like.email_%,event_type.like.workflow_email%,event_type.eq.plan_opened")
    .gte("created_at", since);
  if (range) q = q.lt("created_at", range.until.toISOString());
  const { data, error } = await q.limit(5000);
  if (error) throw new Error(error.message);
  // Leads with any of these events. Workflow emails (the confirmation email
  // is one now) log workflow_email / workflow_email_opened.
  const leads = (...t: string[]) => new Set((data ?? []).filter((r) => t.includes(r.event_type)).map((r) => r.lead_id)).size;
  return {
    sent: leads("email_sent", "workflow_email"),
    delivered: leads("email_delivered"),
    opened: leads("email_opened", "workflow_email_opened"),
    clicked: leads("email_clicked"),
    bounced: leads("email_bounced"),
    failed: leads("email_failed"),
    spam: leads("email_complained"),
    // From the email only: an open on the thank-you page isn't an email result.
    planOpened: new Set((data ?? []).filter((r) => r.event_type === "plan_opened" && r.from_value !== "thank_you").map((r) => r.lead_id)).size,
  };
}
