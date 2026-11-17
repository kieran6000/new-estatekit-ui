import { supabase } from "./_client";

// The Mail monitor (operator "Mail" tab). Read-only over data the automations
// already write: every workflow email it sent (workflow_emails) plus the
// delivery/bounce reports in the lead history (lead_events). Replies aren't
// here yet — they arrive with the team inbox (Gmail) in stage 2.

export interface SentEmail {
  id: string;
  subject: string | null;
  sent_at: string;
  opened_at: string | null;
  lead_id: string;
  agent_id: string | null;
  lead_name: string | null;
  lead_email: string | null;
  delivered: boolean;
  clicked: boolean;
  bounced: boolean;
}

export interface EmailMetrics {
  sent: number;
  opened: number;
  openRate: number; // 0..1
  bounced: number;
  complained: number;
  clicked: number;
}

/** Thrown when the workflows tables aren't there yet. */
export class WorkflowEmailsNotSetUp extends Error {}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function notSetUp(error: { message?: string; code?: string }): boolean {
  return /does not exist|schema cache|42P01/i.test(`${error.message ?? ""} ${error.code ?? ""}`);
}

/** Every workflow email sent in the window, newest first, with the lead it
 *  went to and whether that lead later bounced/complained. */
export async function listWorkflowEmails(days = 30): Promise<SentEmail[]> {
  const since = sinceIso(days);
  const { data, error } = await supabase
    .from("workflow_emails")
    .select("id, subject, sent_at, opened_at, lead_id, agent_id, leads(name, email)")
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(2000);
  if (error) {
    if (notSetUp(error)) throw new WorkflowEmailsNotSetUp(error.message);
    throw new Error(error.message);
  }
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    subject: string | null;
    sent_at: string;
    opened_at: string | null;
    lead_id: string;
    agent_id: string | null;
    leads: { name: string | null; email: string | null } | null;
  }>;

  // Which of these leads had a bounce/complaint in the window, so a row can be
  // flagged. (Reports are keyed to the lead, not the single email, so this is
  // "this lead's email bounced", good enough for the monitor.)
  const marks = await deliveryMarks(since);

  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    sent_at: r.sent_at,
    opened_at: r.opened_at,
    lead_id: r.lead_id,
    agent_id: r.agent_id,
    lead_name: r.leads?.name ?? null,
    lead_email: r.leads?.email ?? null,
    delivered: marks.delivered.has(r.lead_id),
    clicked: marks.clicked.has(r.lead_id),
    bounced: marks.bounced.has(r.lead_id),
  }));
}

/** Which leads were reported delivered / clicked / bounced in the window, so
 *  each row can show the right ticks. (Reports are keyed to the lead, not the
 *  single email, so this reads as "this lead's email was delivered".) */
async function deliveryMarks(sinceIso: string): Promise<{ delivered: Set<string>; clicked: Set<string>; bounced: Set<string> }> {
  const out = { delivered: new Set<string>(), clicked: new Set<string>(), bounced: new Set<string>() };
  const { data, error } = await supabase
    .from("lead_events")
    .select("lead_id, event_type")
    .in("event_type", ["email_delivered", "email_clicked", "email_bounced", "email_complained"])
    .gte("created_at", sinceIso)
    .limit(8000);
  if (error) return out;
  for (const r of (data ?? []) as Array<{ lead_id: string; event_type: string }>) {
    if (r.event_type === "email_delivered") out.delivered.add(r.lead_id);
    else if (r.event_type === "email_clicked") out.clicked.add(r.lead_id);
    else out.bounced.add(r.lead_id);
  }
  return out;
}

/** Top-of-page totals for the window. */
export async function emailMetrics(days = 30): Promise<EmailMetrics> {
  const since = sinceIso(days);
  const sentQ = supabase.from("workflow_emails").select("id", { count: "exact", head: true }).gte("sent_at", since);
  const openedQ = supabase
    .from("workflow_emails")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", since)
    .not("opened_at", "is", null);
  const bouncedQ = supabase
    .from("lead_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "email_bounced")
    .gte("created_at", since);
  const complainedQ = supabase
    .from("lead_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "email_complained")
    .gte("created_at", since);
  const clickedQ = supabase
    .from("lead_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "email_clicked")
    .gte("created_at", since);

  const [sentR, openedR, bouncedR, complainedR, clickedR] = await Promise.all([sentQ, openedQ, bouncedQ, complainedQ, clickedQ]);
  if (sentR.error && notSetUp(sentR.error)) throw new WorkflowEmailsNotSetUp(sentR.error.message);

  const sent = sentR.count ?? 0;
  const opened = openedR.count ?? 0;
  return {
    sent,
    opened,
    openRate: sent > 0 ? opened / sent : 0,
    bounced: bouncedR.count ?? 0,
    complained: complainedR.count ?? 0,
    clicked: clickedR.count ?? 0,
  };
}
