// Puts one queued (lead, kind) into the agent's Google Calendar so it matches
// the lead: adds it, moves it, or takes it out. Used by the cron
// (google-calendar-sync) and right after an agent logs a call
// (google-calendar, action "sync"), so both behave the same.
//
// The rules, beyond calendarEvents.ts:
//  * Entries whose time has passed are their history: never moved, changed
//    or deleted. If the lead now wants a different time, that's a new entry.
//  * Nothing is created in the past ("No answer" sets a reminder for now:
//    that's the call list's job, not the calendar's).
//  * Creates use our own event id (eventIdFor), so a retry or two workers at
//    once can't make duplicates: Google answers 409 and we update that one.
//  * Updates send status "confirmed": an entry they deleted in Google comes
//    back when the lead changes, because EstateKit is what the calendar shows.
//  * A lead moved to another agent leaves the old agent's calendar first.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { desiredEvent, eventIdFor, type CalEvent, type CalKind, type CalLead } from "./calendarEvents.ts";
import { accessTokenFor, CAL_API, CONN_COLUMNS, markReconnect, type Conn, type TokenResult } from "./google.ts";
import { needsAttention } from "./attention.ts";

export interface QueueRow { lead_id: string; kind: CalKind; attempts: number; queued_at: string }

export type SyncAction =
  | "created" | "moved" | "updated" | "removed" // their calendar changed
  | "none"       // nothing to do (no entry wanted, none there)
  | "kept"       // a past entry, left alone
  | "retry"      // Google didn't manage it; queued to try again
  | "failed"     // gave up after several tries
  | "reconnect"; // Google access is gone: they need to connect again

export interface SyncResult { lead_id: string; kind: CalKind; action: SyncAction; at?: string | null; link?: string | null }

const LEAD_COLUMNS = "id, agent_id, pipeline_id, name, phone, stage, archived, appointment_at, call_at, reminder_at, next_label, note, form_answers";

type Existing = { google_event_id: string; agent_id: string; starts_at: string | null; html_link: string | null };

export class CalendarSync {
  private conns = new Map<string, Conn | null>();
  private tokens = new Map<string, TokenResult>();
  private pipelineKinds = new Map<string, string | null>();
  private synced = new Set<string>();

  constructor(private admin: SupabaseClient) {}

  /** Works one claimed queue row and settles it (done / retry). */
  async run(q: QueueRow): Promise<SyncResult> {
    let r: SyncResult;
    try {
      r = await this.work(q);
    } catch (err) {
      console.error("calendar sync", q.lead_id, q.kind, err);
      r = { lead_id: q.lead_id, kind: q.kind, action: "retry" };
    }
    if (r.action === "retry") {
      const { data: gaveUp } = await this.admin.rpc("google_calendar_retry", { p_lead: q.lead_id, p_kind: q.kind, p_queued_at: q.queued_at });
      if (gaveUp === true) {
        r.action = "failed";
        const agentId = await this.agentOf(q.lead_id);
        if (agentId) await this.admin.from("google_calendar_connections").update({ last_error: "Google didn't accept a calendar entry." }).eq("agent_id", agentId);
      }
    } else {
      await this.admin.rpc("google_calendar_done", { p_lead: q.lead_id, p_kind: q.kind, p_queued_at: q.queued_at });
    }
    return r;
  }

  private async work(q: QueueRow): Promise<SyncResult> {
    const out = (action: SyncAction, at?: string | null, link?: string | null): SyncResult => ({ lead_id: q.lead_id, kind: q.kind, action, at, link });
    const { data: leadRow } = await this.admin.from("leads").select(LEAD_COLUMNS).eq("id", q.lead_id).maybeSingle();
    const lead = leadRow as (CalLead & { agent_id: string; pipeline_id: string | null }) | null;
    const { data: ex } = await this.admin.from("google_calendar_events")
      .select("google_event_id, agent_id, starts_at, html_link").eq("lead_id", q.lead_id).eq("kind", q.kind).maybeSingle();
    let existing = ex as Existing | null;

    // Moved to another agent: out of the old agent's calendar first.
    if (existing && lead && existing.agent_id !== lead.agent_id) {
      const gone = await this.removeEvent(existing.agent_id, existing.google_event_id, existing.starts_at);
      if (gone === "retry") return out("retry");
      await this.forget(q);
      existing = null;
    }

    const agentId = lead?.agent_id ?? existing?.agent_id;
    if (!agentId) return out("none");
    const conn = await this.conn(agentId);
    if (!conn || conn.needs_reconnect) return out(conn?.needs_reconnect ? "reconnect" : "none");
    const auth = await this.auth(conn);
    if (auth === "gone") return out("reconnect");
    if (!auth) return out("retry");
    const cal = `${CAL_API}/calendars/${encodeURIComponent(conn.calendar_id || "primary")}/events`;

    const now = Date.now();
    let want: CalEvent | null = lead
      ? desiredEvent(lead, q.kind, { pipelineKind: await this.pipelineKind(lead.pipeline_id), timeZone: conn.time_zone })
      : null;
    const wantAt = want?.start.dateTime ?? null;

    // Already happened: leave it as it is.
    if (existing?.starts_at && Date.parse(existing.starts_at) <= now) {
      if (wantAt && Math.abs(Date.parse(wantAt) - Date.parse(existing.starts_at)) < 60_000) return out("kept", existing.starts_at, existing.html_link);
      await this.forget(q);
      existing = null;
    }
    // Never put something in the past.
    if (wantAt && Date.parse(wantAt) <= now) want = null;

    if (!want) {
      if (!existing) return out("none");
      const r = await fetch(`${cal}/${encodeURIComponent(existing.google_event_id)}`, { method: "DELETE", headers: auth });
      if (!(r.ok || r.status === 404 || r.status === 410)) return this.failed(conn, r, out);
      await this.forget(q);
      this.touched(agentId);
      return out("removed");
    }

    if (existing) {
      const r = await fetch(`${cal}/${encodeURIComponent(existing.google_event_id)}`, {
        method: "PATCH", headers: auth, body: JSON.stringify({ ...want, status: "confirmed" }),
      });
      if (r.ok) {
        const e = await r.json().catch(() => ({}));
        const moved = !existing.starts_at || Math.abs(Date.parse(existing.starts_at) - Date.parse(want.start.dateTime)) >= 60_000;
        await this.admin.from("google_calendar_events")
          .update({ starts_at: want.start.dateTime, html_link: e.htmlLink ?? existing.html_link, updated_at: new Date().toISOString() })
          .eq("lead_id", q.lead_id).eq("kind", q.kind);
        this.touched(agentId);
        return out(moved ? "moved" : "updated", want.start.dateTime, e.htmlLink ?? existing.html_link);
      }
      if (r.status !== 404 && r.status !== 410) return this.failed(conn, r, out);
      await r.body?.cancel();
      // Gone from Google for good: make it again below.
      await this.forget(q);
      existing = null;
    }

    // Create, under our own id.
    const id = eventIdFor(q.lead_id, q.kind, want.start.dateTime);
    let r = await fetch(cal, { method: "POST", headers: auth, body: JSON.stringify({ id, ...want }) });
    if (r.status === 409) {
      // Ours already (an earlier try), or one they deleted: bring it up to date.
      await r.body?.cancel();
      r = await fetch(`${cal}/${id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ ...want, status: "confirmed" }) });
      if (r.status === 404 || r.status === 410) {
        await r.body?.cancel();
        r = await fetch(cal, { method: "POST", headers: auth, body: JSON.stringify(want) }); // Google picks the id
      }
    }
    if (!r.ok) return this.failed(conn, r, out);
    const e = await r.json().catch(() => ({}));
    if (!e.id) return out("retry");
    const { error } = await this.admin.from("google_calendar_events").upsert({
      lead_id: q.lead_id, kind: q.kind, agent_id: agentId, google_event_id: e.id,
      starts_at: want.start.dateTime, html_link: e.htmlLink ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: "lead_id,kind" });
    if (error) console.error("save calendar event", q.lead_id, error.message);
    this.touched(agentId);
    return out("created", want.start.dateTime, e.htmlLink ?? null);
  }

  /** Upcoming entries of leads that were deleted (google_calendar_trash). */
  async emptyTrash(limit = 25): Promise<number> {
    const { data } = await this.admin.from("google_calendar_trash")
      .select("agent_id, google_event_id, starts_at, attempts")
      .or(`retry_at.is.null,retry_at.lte.${new Date().toISOString()}`)
      .order("queued_at").limit(limit);
    let n = 0;
    for (const t of (data ?? []) as { agent_id: string; google_event_id: string; starts_at: string | null; attempts: number }[]) {
      const r = await this.removeEvent(t.agent_id, t.google_event_id, t.starts_at).catch(() => "retry" as const);
      const row = this.admin.from("google_calendar_trash");
      if (r === "retry" && t.attempts + 1 < 6) {
        await row.update({ attempts: t.attempts + 1, retry_at: new Date(Date.now() + 2 ** (t.attempts + 1) * 60_000).toISOString() })
          .eq("agent_id", t.agent_id).eq("google_event_id", t.google_event_id);
      } else {
        await row.delete().eq("agent_id", t.agent_id).eq("google_event_id", t.google_event_id);
        n++;
      }
    }
    return n;
  }

  /** Records that this agent's calendar answered (once per run). */
  async finish(): Promise<void> {
    if (!this.synced.size) return;
    await this.admin.from("google_calendar_connections")
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .in("agent_id", [...this.synced]).eq("needs_reconnect", false);
  }

  // ---- helpers

  async conn(agentId: string): Promise<Conn | null> {
    if (!this.conns.has(agentId)) {
      const { data } = await this.admin.from("google_calendar_connections").select(CONN_COLUMNS).eq("agent_id", agentId).maybeSingle();
      this.conns.set(agentId, (data as Conn | null) ?? null);
    }
    return this.conns.get(agentId) ?? null;
  }

  /** Request headers with a working token; "gone" (marked for reconnect);
   *  or null (Google didn't answer: try later). */
  async auth(conn: Conn): Promise<Record<string, string> | "gone" | null> {
    if (!this.tokens.has(conn.agent_id)) {
      const t = await accessTokenFor(this.admin, conn);
      if (t.gone) {
        await markReconnect(this.admin, conn.agent_id, "Google stopped letting EstateKit in. Connect again.");
        conn.needs_reconnect = true;
        await needsAttention({
          key: `gcal:${conn.agent_id}`,
          agentId: conn.agent_id,
          title: "Google Calendar disconnected",
          detail: "Google stopped letting EstateKit into their calendar (they may have removed access or changed their password).",
          fix: "Ask them to open EstateKit → Account and press Reconnect. Until then their appointments won't reach their calendar.",
          quietHours: 24,
        });
      }
      this.tokens.set(conn.agent_id, t);
    }
    const t = this.tokens.get(conn.agent_id)!;
    if (t.gone) return "gone";
    return t.token ? { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" } : null;
  }

  /** Takes an entry out of an agent's calendar if it's still to come. */
  private async removeEvent(agentId: string, eventId: string, startsAt: string | null): Promise<"done" | "retry"> {
    if (startsAt && Date.parse(startsAt) <= Date.now()) return "done";
    const conn = await this.conn(agentId);
    if (!conn || conn.needs_reconnect) return "done"; // can't reach it; nothing more to do
    const auth = await this.auth(conn);
    if (auth === "gone") return "done";
    if (!auth) return "retry";
    const r = await fetch(`${CAL_API}/calendars/${encodeURIComponent(conn.calendar_id || "primary")}/events/${encodeURIComponent(eventId)}`, { method: "DELETE", headers: auth });
    await r.body?.cancel();
    return r.ok || r.status === 404 || r.status === 410 ? "done" : "retry";
  }

  /** Stop tracking our entry for this lead and kind (Google keeps it). */
  private async forget(q: QueueRow): Promise<void> {
    await this.admin.from("google_calendar_events").delete().eq("lead_id", q.lead_id).eq("kind", q.kind);
  }

  /** Google refused: they took calendar access away (reconnect), or try later. */
  private async failed(conn: Conn, r: Response, out: (a: SyncAction) => SyncResult): Promise<SyncResult> {
    const body = await r.text().catch(() => "");
    console.error("google calendar", conn.agent_id, r.status, body.slice(0, 300));
    if (r.status === 401) this.tokens.delete(conn.agent_id); // a fresh token next time
    if (r.status === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/.test(body)) {
      // They unticked the calendar box on Google's page: only they can fix it.
      await markReconnect(this.admin, conn.agent_id, "EstateKit isn't allowed into this Google Calendar. Connect again and tick the calendar box.");
      conn.needs_reconnect = true;
        await needsAttention({
          key: `gcal:${conn.agent_id}`,
          agentId: conn.agent_id,
          title: "Google Calendar disconnected",
          detail: "They connected without ticking the calendar box on Google's page, so EstateKit can't add to their calendar.",
          fix: "Ask them to open EstateKit → Account and press Reconnect. Until then their appointments won't reach their calendar.",
          quietHours: 24,
        });
      return out("reconnect");
    }
    if (r.status === 403 && /accessNotConfigured|SERVICE_DISABLED/.test(body)) {
      // The Calendar API isn't switched on in EstateKit's Google project: ours to fix.
      await this.admin.from("google_calendar_connections")
        .update({ last_error: "The Google Calendar API is switched off in EstateKit's Google Cloud project." }).eq("agent_id", conn.agent_id);
      await needsAttention({
        key: "gcal_api",
        title: "Google Calendar sync is switched off",
        detail: "The Google Calendar API is turned off in EstateKit's Google Cloud project, so nothing reaches anyone's calendar.",
        fix: "In Google Cloud Console, open APIs & Services and enable the Google Calendar API.",
        quietHours: 24,
      });
    }
    return out("retry");
  }

  private touched(agentId: string) { this.synced.add(agentId); }

  private async pipelineKind(id: string | null): Promise<string | null> {
    if (!id) return null;
    if (!this.pipelineKinds.has(id)) {
      const { data } = await this.admin.from("pipelines").select("kind").eq("id", id).maybeSingle();
      this.pipelineKinds.set(id, (data?.kind as string | undefined) ?? null);
    }
    return this.pipelineKinds.get(id) ?? null;
  }

  private async agentOf(leadId: string): Promise<string | null> {
    const { data } = await this.admin.from("leads").select("agent_id").eq("id", leadId).maybeSingle();
    return (data?.agent_id as string | undefined) ?? null;
  }
}
