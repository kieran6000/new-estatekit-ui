import { supabase } from "./_client";

// The Mail monitor (operator "Mail" tab). Read-only over data the automations
// already write: every workflow email it sent (workflow_emails), with that
// email's own delivery report, opens and link taps on the row itself.
//
// Before 17 Nov 2026 the reports were only kept against the lead, so one
// bounce lit up every email that lead had been sent. Emails from before then
// still read that way (deliveryMarks) so their ticks don't go blank.

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

/** Email has no "delivered" receipt; what comes back is a bounce, usually
 *  within seconds. So once a few minutes have passed with nothing bounced, it
 *  reached them — which also covers a report the email service never sent. */
const SETTLED_MS = 15 * 60_000;

const PER_EMAIL_COLS =
  "id, subject, sent_at, opened_at, lead_id, agent_id, delivered_at, bounced_at, complained_at, clicked_at, leads(name, email)";
const PLAIN_COLS = "id, subject, sent_at, opened_at, lead_id, agent_id, leads(name, email)";

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function notSetUp(error: { message?: string; code?: string }): boolean {
  return /does not exist|schema cache|42P01/i.test(`${error.message ?? ""} ${error.code ?? ""}`);
}

/** Whether each email carries its own report yet. Asked once per visit: an
 *  account that hasn't had the change applied falls back to the old reading
 *  instead of showing an error. */
let perEmailReady: Promise<boolean> | undefined;
function hasPerEmail(): Promise<boolean> {
  perEmailReady ??= (async () => {
    const { error } = await supabase.from("workflow_emails").select("delivered_at").limit(1);
    return !error || !notSetUp(error);
  })();
  return perEmailReady;
}

interface Row {
  id: string;
  subject: string | null;
  sent_at: string;
  opened_at: string | null;
  lead_id: string;
  agent_id: string | null;
  delivered_at?: string | null;
  bounced_at?: string | null;
  complained_at?: string | null;
  clicked_at?: string | null;
  leads: { name: string | null; email: string | null } | null;
}

/** EstateKit's own accounts. Mail is the staff's inbox: our own funnel and
 *  what we send, never a client's mail to their sellers — that belongs on the
 *  client's own page, not in here. */
let oursReady: Promise<string[]> | undefined;
function ourAgentIds(): Promise<string[]> {
  oursReady ??= (async () => {
    const { data } = await supabase.from("agent_profiles").select("agent_id").eq("is_operator", true);
    return (data ?? []).map((r: { agent_id: string }) => r.agent_id);
  })();
  return oursReady;
}

/** Every workflow email we sent in the window, newest first, with who it went
 *  to and how that email itself did. */
export async function listWorkflowEmails(days = 30): Promise<SentEmail[]> {
  const since = sinceIso(days);
  const perEmail = await hasPerEmail();
  const ours = await ourAgentIds();
  if (ours.length === 0) return [];
  const { data, error } = await supabase
    .from("workflow_emails")
    .select(perEmail ? PER_EMAIL_COLS : PLAIN_COLS)
    .in("agent_id", ours)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(2000);
  if (error) {
    if (notSetUp(error)) throw new WorkflowEmailsNotSetUp(error.message);
    throw new Error(error.message);
  }
  const rows = (data ?? []) as unknown as Row[];

  // Older emails have nothing on the row, so they read from the lead's own
  // reports the way they always did.
  const marks = perEmail ? null : await deliveryMarks(since);

  return rows.map((r) => {
    const bounced = marks ? marks.bounced.has(r.lead_id) : !!(r.bounced_at || r.complained_at);
    const settled = Date.now() - new Date(r.sent_at).getTime() > SETTLED_MS;
    return {
      id: r.id,
      subject: r.subject,
      sent_at: r.sent_at,
      opened_at: r.opened_at,
      lead_id: r.lead_id,
      agent_id: r.agent_id,
      lead_name: r.leads?.name ?? null,
      lead_email: r.leads?.email ?? null,
      delivered: marks ? marks.delivered.has(r.lead_id) : !bounced && (!!r.delivered_at || settled),
      clicked: marks ? marks.clicked.has(r.lead_id) : !!r.clicked_at,
      bounced,
    };
  });
}

/** The wording of one automated email, kept with its record since 17 Nov
 *  2026. Older ones were never kept, so this comes back empty for them and the
 *  screen says so instead of showing a blank page. */
export async function workflowEmailBody(id: string): Promise<string | null> {
  const { data, error } = await supabase.from("workflow_emails").select("body_html").eq("id", id).maybeSingle();
  if (error) {
    if (notSetUp(error)) return null;
    throw new Error(error.message);
  }
  return (data as { body_html: string | null } | null)?.body_html ?? null;
}

/** The old reading: which leads were reported delivered / clicked / bounced in
 *  the window. Kept for emails sent before each one carried its own report. */
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
  const perEmail = await hasPerEmail();
  const count = (table: string, column: string | null, type?: string) => {
    let q = supabase.from(table).select("id", { count: "exact", head: true });
    q = table === "workflow_emails" ? q.gte("sent_at", since) : q.gte("created_at", since).eq("event_type", type!);
    return column ? q.not(column, "is", null) : q;
  };

  const [sentR, openedR, bouncedR, complainedR, clickedR] = await Promise.all([
    count("workflow_emails", null),
    count("workflow_emails", "opened_at"),
    perEmail ? count("workflow_emails", "bounced_at") : count("lead_events", null, "email_bounced"),
    perEmail ? count("workflow_emails", "complained_at") : count("lead_events", null, "email_complained"),
    perEmail ? count("workflow_emails", "clicked_at") : count("lead_events", null, "email_clicked"),
  ]);
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
