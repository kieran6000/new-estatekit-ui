import { supabase } from "./_client";

// Google Calendar: each agent connects their own Google account once, and
// their appointments, the call times leads pick and their follow-up
// reminders go into it by themselves. See supabase/functions/google-calendar
// (connect, disconnect, events, sync), google-calendar-callback and
// google-calendar-sync (the cron), and migration 20261104_0001.

export interface GoogleCalendarStatus {
  /** Google keys are in the vault: connecting can work at all. */
  ready: boolean;
  connected: boolean;
  /** The Google account it's connected to. */
  email: string | null;
  /** Google stopped letting us in (access removed, calendar box unticked): connect again. */
  needsReconnect: boolean;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** Changes waiting to go in. */
  pending: number;
  /** EstateKit entries still to come in their calendar, by kind. */
  upcoming: { appointment?: number; call?: number; followup?: number };
}

/** The signed-in agent's own connection, or (for an operator) the agent
 *  they're switched into. Null when the database won't say (not allowed). */
export async function getGoogleCalendarStatus(agentId?: string): Promise<GoogleCalendarStatus | null> {
  const { data, error } = await supabase.rpc("google_calendar_status", agentId ? { p_agent: agentId } : {});
  if (error) throw error;
  if (!data) return null;
  const d = data as Record<string, unknown>;
  return {
    ready: d.ready === true,
    connected: d.connected === true,
    email: typeof d.email === "string" ? d.email : null,
    needsReconnect: d.needs_reconnect === true,
    connectedAt: (d.connected_at as string) ?? null,
    lastSyncedAt: (d.last_synced_at as string) ?? null,
    lastError: (d.last_error as string) ?? null,
    pending: Number(d.pending) || 0,
    upcoming: (d.upcoming as GoogleCalendarStatus["upcoming"]) ?? {},
  };
}

/** Sends them to Google's "allow" page; Google brings them back to returnTo
 *  on this same site with ?calendar=connected (or cancelled / noscope / error). */
export async function connectGoogleCalendar(returnTo = "/account"): Promise<void> {
  const { data, error } = await supabase.functions.invoke("google-calendar", {
    body: { action: "connect", returnTo, origin: window.location.origin },
  });
  if (data?.error === "not_configured") throw new Error("not_configured");
  if (error || !data?.url) throw new Error(data?.error || error?.message || "no url");
  window.location.assign(data.url);
}

/** Stops syncing, takes EstateKit's upcoming entries out of their calendar
 *  (past ones stay: their history) and tells Google to forget us. */
export async function disconnectGoogleCalendar(): Promise<{ removed: number }> {
  const { data, error } = await supabase.functions.invoke("google-calendar", { body: { action: "disconnect" } });
  if (error || !data?.ok) throw new Error(data?.error || error?.message || "not disconnected");
  return { removed: Number(data.removed) || 0 };
}

export type CalSyncKind = "appointment" | "call" | "followup";
export interface CalSyncResult {
  lead_id: string;
  kind: CalSyncKind;
  action: "created" | "moved" | "updated" | "removed" | "none" | "kept" | "retry" | "failed" | "reconnect";
  at?: string | null;
  link?: string | null;
}

/** Puts a lead's changes into Google Calendar now (after logging a call)
 *  rather than within the minute. What happened to each of its entries. */
export async function syncLeadToGoogle(leadId: string): Promise<CalSyncResult[]> {
  const { data, error } = await supabase.functions.invoke("google-calendar", { body: { action: "sync", leadId } });
  if (error) throw error;
  return (data?.results ?? []) as CalSyncResult[];
}

export interface GoogleEvent {
  id: string;
  title: string;
  /** ISO date-time, or YYYY-MM-DD for an all-day event. */
  start: string;
  /** ISO date-time, or the (exclusive) YYYY-MM-DD after an all-day event. */
  end: string;
  allDay: boolean;
  link: string | null;
}
export interface SyncedEntry { lead_id: string; kind: CalSyncKind; starts_at: string; html_link: string | null }
export interface GoogleWindow {
  connected: boolean;
  needsReconnect?: boolean;
  /** Their own events (EstateKit's entries left out: the Calendar tab has those). */
  events: GoogleEvent[];
  /** EstateKit entries that are in their Google Calendar. */
  synced: SyncedEntry[];
}

/** The signed-in person's own Google Calendar between two moments. */
export async function listGoogleEvents(timeMin: Date, timeMax: Date): Promise<GoogleWindow> {
  const { data, error } = await supabase.functions.invoke("google-calendar", {
    body: { action: "events", timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() },
  });
  if (error || data?.error) throw new Error(data?.error || error?.message || "events");
  return { connected: !!data.connected, needsReconnect: !!data.needsReconnect, events: data.events ?? [], synced: data.synced ?? [] };
}
