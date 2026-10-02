import { supabase } from "./_client";
import { getWeeklyReport, weekLabel, weekStartDate, type WeeklyReport } from "./weeklyReport";

// Sending the weekly report to agents (Accounts → Weekly reports), and the
// agent's view of a sent report (/r/<token>). The weekly-report edge function
// does the sending and the open-counting; see its header for the rules.

export interface ReportSend {
  id: string;
  agent_id: string;
  week_start: string;
  period: string;
  status: "sending" | "sent" | "failed";
  error: string | null;
  sent_by_name: string | null;
  sent_at: string;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
}

/** Thrown when the table hasn't been created yet (the SQL in
 *  supabase/migrations/20261002_0001_weekly_report_sends.sql). */
export class ReportsNotSetUp extends Error {}

/** Every send, newest first (last ~12 weeks): the page picks what it needs. */
export async function listReportSends(): Promise<ReportSend[]> {
  const since = weekStartDate(12);
  const { data, error } = await supabase
    .from("weekly_report_sends")
    .select("id, agent_id, week_start, period, status, error, sent_by_name, sent_at, first_opened_at, last_opened_at, open_count")
    .gte("week_start", since)
    .order("sent_at", { ascending: false })
    .limit(2000);
  if (error) {
    if (/does not exist|schema cache|42P01/i.test(`${error.message} ${error.code ?? ""}`)) throw new ReportsNotSetUp(error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as ReportSend[];
}

async function functionError(error: unknown): Promise<string> {
  // supabase-js hides the JSON body of a non-2xx answer in error.context.
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const b = await ctx.json();
      if (b?.error) return String(b.error);
    } catch { /* not JSON */ }
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

/** Works out the report as it stands now, saves it and WhatsApps the agent a link. */
export async function sendWeeklyReport(agentId: string, weeksBack: number): Promise<void> {
  const data = await getWeeklyReport(agentId, weeksBack);
  const { error } = await supabase.functions.invoke("weekly-report", {
    body: { action: "send", agentId, weekStart: weekStartDate(weeksBack), period: weekLabel(weeksBack), data },
  });
  if (error) throw new Error(await functionError(error));
}

export interface SharedReport {
  period: string;
  data: WeeklyReport;
  name: string;
  avatarUrl: string | null;
}

/** The report behind a /r/<token> link, exactly as it was sent. */
export async function getSharedReport(token: string): Promise<SharedReport | null> {
  const { data, error } = await supabase.functions.invoke("weekly-report", { body: { action: "view", token } });
  if (error) {
    const msg = await functionError(error);
    if (msg === "not_found") return null;
    throw new Error(msg);
  }
  return data as SharedReport;
}

export interface ReportAgent {
  agent_id: string;
  display_name: string | null;
  whatsapp_number: string | null;
  avatar_url: string | null;
}

/** Every active client account (no operators, no deactivated accounts). */
export async function listReportAgents(): Promise<ReportAgent[]> {
  const { data, error } = await supabase
    .from("agent_profiles")
    .select("agent_id, display_name, whatsapp_number, avatar_url, is_operator, deactivated_at")
    .order("display_name", { ascending: true });
  if (error) throw new Error(error.message);
  // Deactivated accounts don't get reports.
  return (data ?? []).filter((p) => !p.is_operator && !p.deactivated_at).map(({ is_operator: _op, deactivated_at: _d, ...p }) => p);
}
