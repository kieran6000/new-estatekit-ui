// Each minute (cron): puts what changed into agents' Google Calendars. Works
// through google_calendar_queue (filled by a trigger on leads): for each lead
// and kind (appointment / call) it adds, moves or removes the agent's event
// so it matches the lead (events.ts). Public, like run-automations: it only
// ever works through the queue.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the vault.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { desiredEvent, type CalLead } from "./events.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const API = "https://www.googleapis.com/calendar/v3";
const BATCH = 40;
const MAX_ATTEMPTS = 5;

interface Conn { agent_id: string; refresh_token: string; access_token: string | null; expires_at: string | null; calendar_id: string }

async function secret(name: string): Promise<string> {
  const { data } = await admin.rpc("get_secret", { secret_name: name });
  return data || Deno.env.get(name) || "";
}

/** A working access token (Google's last about an hour), or why not. */
async function accessToken(c: Conn): Promise<{ token?: string; gone?: boolean }> {
  if (c.access_token && c.expires_at && Date.parse(c.expires_at) > Date.now() + 60_000) return { token: c.access_token };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: await secret("GOOGLE_CLIENT_ID"),
      client_secret: await secret("GOOGLE_CLIENT_SECRET"),
      refresh_token: c.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const t = await res.json().catch(() => ({}));
  // They removed EstateKit from their Google account (or the key expired).
  if (t.error === "invalid_grant") return { gone: true };
  if (!res.ok || !t.access_token) return {};
  c.access_token = t.access_token;
  c.expires_at = new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString();
  await admin.from("google_calendar_connections").update({ access_token: c.access_token, expires_at: c.expires_at }).eq("agent_id", c.agent_id);
  return { token: c.access_token };
}

Deno.serve(async () => {
  const { data: queue } = await admin.from("google_calendar_queue").select("lead_id, kind, attempts").order("queued_at").limit(BATCH);
  let done = 0;
  const conns = new Map<string, Conn | null>();
  const tokens = new Map<string, string | null>();

  for (const q of (queue ?? []) as { lead_id: string; kind: "appointment" | "call"; attempts: number }[]) {
    const drop = () => admin.from("google_calendar_queue").delete().eq("lead_id", q.lead_id).eq("kind", q.kind);
    try {
      const { data: lead } = await admin.from("leads")
        .select("id, agent_id, name, phone, stage, archived, appointment_at, call_at, form_answers")
        .eq("id", q.lead_id).maybeSingle();
      const { data: existing } = await admin.from("google_calendar_events")
        .select("google_event_id, agent_id, starts_at").eq("lead_id", q.lead_id).eq("kind", q.kind).maybeSingle();
      const agentId: string | undefined = (lead?.agent_id as string | undefined) ?? existing?.agent_id;
      if (!agentId) { await drop(); continue; }

      if (!conns.has(agentId)) {
        const { data: c } = await admin.from("google_calendar_connections").select("agent_id, refresh_token, access_token, expires_at, calendar_id").eq("agent_id", agentId).maybeSingle();
        conns.set(agentId, (c as Conn | null) ?? null);
      }
      const conn = conns.get(agentId);
      if (!conn) { await drop(); continue; } // not connected (any more)

      if (!tokens.has(agentId)) {
        const r = await accessToken(conn);
        if (r.gone) {
          await admin.from("google_calendar_connections").update({ last_error: "Google access was removed. Connect again." }).eq("agent_id", agentId);
          await admin.from("agent_profiles").update({ google_calendar_email: null }).eq("agent_id", agentId);
        }
        tokens.set(agentId, r.token ?? null);
      }
      const token = tokens.get(agentId);
      if (!token) { await drop(); continue; }
      const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      const cal = encodeURIComponent(conn.calendar_id || "primary");

      const want = lead ? desiredEvent(lead as CalLead, q.kind) : null;
      let ok = true;
      if (!want) {
        // Shouldn't be there: remove ours (gone already is fine).
        if (existing) {
          const r = await fetch(`${API}/calendars/${cal}/events/${encodeURIComponent(existing.google_event_id)}`, { method: "DELETE", headers: auth });
          ok = r.ok || r.status === 404 || r.status === 410;
          if (ok) await admin.from("google_calendar_events").delete().eq("lead_id", q.lead_id).eq("kind", q.kind);
        }
      } else if (existing) {
        const r = await fetch(`${API}/calendars/${cal}/events/${encodeURIComponent(existing.google_event_id)}`, { method: "PATCH", headers: auth, body: JSON.stringify(want) });
        if (r.status === 404 || r.status === 410) {
          // They deleted it in Google: put it back.
          const c = await fetch(`${API}/calendars/${cal}/events`, { method: "POST", headers: auth, body: JSON.stringify(want) });
          const e = await c.json().catch(() => ({}));
          ok = c.ok && !!e.id;
          if (ok) await admin.from("google_calendar_events").update({ google_event_id: e.id, starts_at: want.start.dateTime, updated_at: new Date().toISOString() }).eq("lead_id", q.lead_id).eq("kind", q.kind);
        } else {
          ok = r.ok;
          if (ok) await admin.from("google_calendar_events").update({ starts_at: want.start.dateTime, updated_at: new Date().toISOString() }).eq("lead_id", q.lead_id).eq("kind", q.kind);
        }
      } else {
        const r = await fetch(`${API}/calendars/${cal}/events`, { method: "POST", headers: auth, body: JSON.stringify(want) });
        const e = await r.json().catch(() => ({}));
        ok = r.ok && !!e.id;
        if (ok) await admin.from("google_calendar_events").insert({ lead_id: q.lead_id, kind: q.kind, agent_id: agentId, google_event_id: e.id, starts_at: want.start.dateTime });
        else console.error("create event", r.status, JSON.stringify(e).slice(0, 300));
      }

      if (ok) {
        await drop();
        await admin.from("google_calendar_connections").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("agent_id", agentId);
        done++;
      } else if (q.attempts + 1 >= MAX_ATTEMPTS) {
        await drop();
        await admin.from("google_calendar_connections").update({ last_error: "Google didn't accept a calendar entry." }).eq("agent_id", agentId);
      } else {
        await admin.from("google_calendar_queue").update({ attempts: q.attempts + 1, queued_at: new Date().toISOString() }).eq("lead_id", q.lead_id).eq("kind", q.kind);
      }
    } catch (err) {
      console.error("calendar sync", q.lead_id, err);
    }
  }
  return new Response(JSON.stringify({ processed: (queue ?? []).length, done }), { headers: { "Content-Type": "application/json" } });
});
