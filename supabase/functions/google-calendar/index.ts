// Google Calendar, for the signed-in agent (their own Google account):
//   { action: "connect", returnTo, origin } → { url }: Google's "allow" page.
//       Google then sends them to google-calendar-callback, which saves it.
//   { action: "disconnect" } → takes EstateKit's upcoming entries out of their
//       calendar, tells Google to forget us, and stops syncing.
//   { action: "events", timeMin, timeMax } → their own Google events in that
//       window (for the Calendar tab), and which EstateKit entries are in it.
//       Only ever the signed-in person's own calendar, never an account an
//       operator is switched into.
//   { action: "sync", leadId } → puts that lead's changes into Google now
//       (right after "How did it go?"), instead of within the minute.
// Auth: a signed-in user (checked here). sync also allows an operator.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the vault.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CalendarSync, type QueueRow, type SyncResult } from "../_shared/calendarSync.ts";
import {
  CAL_API, CALENDAR_SCOPE, CONN_COLUMNS, CORS, json, markReconnect, pkcePair, redirectUri, REVOKE_URL,
  safeOrigin, safePath, secret, unseal, type Conn,
} from "../_shared/google.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
// Only what we need: events in their calendars, and who they are (email).
const SCOPES = ["openid", "email", CALENDAR_SCOPE];
const DAY = 86_400_000;

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  eventType?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
  extendedProperties?: { private?: Record<string, string> };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: u } = await asUser.auth.getUser();
    const me = u?.user?.id;
    if (!me) return json({ error: "not_signed_in" }, 401);
    const b = await req.json().catch(() => ({}));

    if (b.action === "connect") {
      const clientId = await secret(admin, "GOOGLE_CLIENT_ID");
      // Answered normally (not an error code), so the app can say it plainly.
      if (!clientId || !(await secret(admin, "GOOGLE_CLIENT_SECRET"))) return json({ error: "not_configured" });
      const state = [...crypto.getRandomValues(new Uint8Array(24))].map((x) => x.toString(16).padStart(2, "0")).join("");
      const { verifier, challenge } = await pkcePair();
      const redirect = await redirectUri(admin);
      await admin.from("google_oauth_states").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());
      const { error } = await admin.from("google_oauth_states").insert({
        state, agent_id: me, return_to: safePath(b.returnTo), origin: safeOrigin(b.origin), code_verifier: verifier, redirect_uri: redirect,
      });
      if (error) {
        console.error("save state", error.message);
        return json({ error: "state" }, 500);
      }
      // Pre-pick their Google account when we know it.
      const { data: prof } = await admin.from("agent_profiles").select("email").eq("agent_id", me).maybeSingle();
      const { data: prev } = await admin.from("google_calendar_connections").select("google_email").eq("agent_id", me).maybeSingle();
      const hint = (prev?.google_email || prof?.email || "").trim();
      const q = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: "code",
        scope: SCOPES.join(" "),
        // offline + consent: Google hands over a refresh token every time,
        // so they never have to connect again unless they remove access.
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        ...(hint.includes("@") ? { login_hint: hint } : {}),
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
    }

    if (b.action === "disconnect") {
      const { data } = await admin.from("google_calendar_connections").select(CONN_COLUMNS).eq("agent_id", me).maybeSingle();
      const conn = data as Conn | null;
      let removed = 0;
      if (conn) {
        // What's still to come would go stale (it would stop moving with the
        // lead), so it comes out. What's passed stays: it's their history.
        const sync = new CalendarSync(admin);
        const auth = conn.needs_reconnect ? null : await sync.auth(conn);
        if (auth && auth !== "gone") {
          const { data: upcoming } = await admin.from("google_calendar_events")
            .select("google_event_id").eq("agent_id", me).gt("starts_at", new Date().toISOString()).limit(300);
          const ids = (upcoming ?? []).map((e: { google_event_id: string }) => e.google_event_id);
          const cal = `${CAL_API}/calendars/${encodeURIComponent(conn.calendar_id || "primary")}/events`;
          for (let i = 0; i < ids.length; i += 6) {
            const res = await Promise.all(ids.slice(i, i + 6).map((id) =>
              fetch(`${cal}/${encodeURIComponent(id)}`, { method: "DELETE", headers: auth })
                .then(async (r) => { await r.body?.cancel(); return r.ok || r.status === 404 || r.status === 410; })
                .catch(() => false)));
            removed += res.filter(Boolean).length;
          }
        }
        try {
          const refresh = await unseal(admin, conn.refresh_token);
          if (refresh) {
            await fetch(REVOKE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: refresh }) })
              .then((r) => r.body?.cancel()).catch(() => null);
          }
        } catch (err) {
          console.error("revoke", err);
        }
      }
      await admin.from("google_calendar_connections").delete().eq("agent_id", me);
      await admin.from("google_calendar_events").delete().eq("agent_id", me);
      await admin.from("google_calendar_trash").delete().eq("agent_id", me);
      await admin.from("agent_profiles").update({ google_calendar_email: null }).eq("agent_id", me);
      return json({ ok: true, removed });
    }

    if (b.action === "events") {
      const from = Date.parse(b.timeMin);
      const to = Date.parse(b.timeMax);
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 62 * DAY) return json({ error: "range" }, 400);
      const { data } = await admin.from("google_calendar_connections").select(CONN_COLUMNS).eq("agent_id", me).maybeSingle();
      const conn = data as Conn | null;
      if (!conn) return json({ connected: false, events: [], synced: [] });
      if (conn.needs_reconnect) return json({ connected: true, needsReconnect: true, events: [], synced: [] });
      const auth = await new CalendarSync(admin).auth(conn);
      if (auth === "gone") return json({ connected: true, needsReconnect: true, events: [], synced: [] });
      if (!auth) return json({ error: "google" }, 502);

      const timeMin = new Date(from).toISOString();
      const timeMax = new Date(to).toISOString();
      const items: GoogleEvent[] = [];
      let pageToken = "";
      for (let page = 0; page < 4; page++) {
        const q = new URLSearchParams({
          timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250",
          fields: "nextPageToken,items(id,status,summary,htmlLink,eventType,start,end,attendees(self,responseStatus),extendedProperties(private))",
          ...(pageToken ? { pageToken } : {}),
        });
        const r = await fetch(`${CAL_API}/calendars/${encodeURIComponent(conn.calendar_id || "primary")}/events?${q}`, { headers: auth });
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          console.error("list events", me, r.status, body.slice(0, 300));
          if (r.status === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/.test(body)) {
            await markReconnect(admin, me, "EstateKit isn't allowed into this Google Calendar. Connect again and tick the calendar box.");
            return json({ connected: true, needsReconnect: true, events: [], synced: [] });
          }
          return json({ error: "google" }, 502);
        }
        const page_ = await r.json();
        items.push(...((page_.items ?? []) as GoogleEvent[]));
        pageToken = page_.nextPageToken || "";
        if (!pageToken) break;
      }

      const events = items
        .filter((e) =>
          e.status !== "cancelled"
          // EstateKit's own entries are already on the Calendar tab.
          && !e.extendedProperties?.private?.estatekit_lead
          // Google's "working from" markers aren't events.
          && e.eventType !== "workingLocation"
          && !e.attendees?.some((a) => a.self && a.responseStatus === "declined"))
        .map((e) => {
          const allDay = !!e.start?.date && !e.start?.dateTime;
          return {
            id: e.id,
            title: (e.summary || "").trim() || "(No title)",
            start: allDay ? e.start!.date! : e.start?.dateTime ?? null,
            end: allDay ? e.end?.date ?? e.start!.date! : e.end?.dateTime ?? e.start?.dateTime ?? null,
            allDay,
            link: e.htmlLink ?? null,
          };
        })
        .filter((e) => e.start && e.end);

      const { data: ours } = await admin.from("google_calendar_events")
        .select("lead_id, kind, starts_at, html_link").eq("agent_id", me)
        .gte("starts_at", timeMin).lt("starts_at", timeMax).limit(1000);
      return json({ connected: true, events, synced: ours ?? [] });
    }

    if (b.action === "sync") {
      if (typeof b.leadId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.leadId)) return json({ error: "lead" }, 400);
      const { data: lead } = await admin.from("leads").select("agent_id").eq("id", b.leadId).maybeSingle();
      if (!lead) return json({ results: [] });
      if (lead.agent_id !== me) {
        const { data: p } = await admin.from("agent_profiles").select("is_operator").eq("agent_id", me).maybeSingle();
        if (!p?.is_operator) return json({ error: "forbidden" }, 403);
      }
      const { data: rows } = await admin.rpc("google_calendar_claim", { p_limit: 5, p_lead: b.leadId });
      const sync = new CalendarSync(admin);
      const results: SyncResult[] = [];
      for (const q of (rows ?? []) as QueueRow[]) results.push(await sync.run(q));
      await sync.finish();
      return json({ results });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: "server" }, 500);
  }
});
