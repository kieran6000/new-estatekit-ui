// Where Google sends an agent back after "Allow" on Connect Google Calendar.
// Swaps Google's one-time code for lasting access (a refresh token, sealed
// before it's stored), queues everything coming up (appointments, picked
// call times, follow-ups), starts putting it in straight away, and sends them
// back to the page they connected from: …?calendar=connected, or cancelled /
// noscope (they unticked the calendar box) / error.
// Public (Google calls it in the agent's browser): the one-time state, tied
// to the agent who asked and to a PKCE verifier only we hold, makes it safe.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the vault.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CalendarSync, type QueueRow } from "../_shared/calendarSync.ts";
import { APP_ORIGIN, CAL_API, CALENDAR_SCOPE, inBackground, knownRedirect, safeOrigin, safePath, seal, secret, TOKEN_URL } from "../_shared/google.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const STATE_TTL = 30 * 60_000;

const back = (origin: string, path: string, result: string) => {
  const url = new URL(path, origin);
  url.searchParams.set("calendar", result);
  return new Response(null, { status: 302, headers: { Location: url.toString(), "Cache-Control": "no-store" } });
};

/** The email in Google's id_token (we asked for it with the "email" scope).
 *  It came straight from Google's token endpoint over TLS, so it's trusted
 *  without checking the signature (as Google's own docs allow). */
function emailFrom(idToken: string | undefined): string | null {
  try {
    const part = (idToken || "").split(".")[1];
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  // The check before switching the return address to leads.estatekit.co:
  // answering means its rewrite reaches us with the query string intact.
  if (u.searchParams.get("ping") === "1") return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const state = u.searchParams.get("state") || "";
  const code = u.searchParams.get("code") || "";
  if (!/^[0-9a-f]{48}$/.test(state)) return back(APP_ORIGIN, "/account", "error");
  const { data: st } = await admin.from("google_oauth_states")
    .select("agent_id, return_to, origin, code_verifier, redirect_uri, created_at").eq("state", state).maybeSingle();
  if (!st) return back(APP_ORIGIN, "/account", "error");
  // One use only.
  await admin.from("google_oauth_states").delete().eq("state", state);
  const origin = safeOrigin(st.origin);
  const returnTo = safePath(st.return_to);
  // They pressed Cancel on Google's page, or took too long.
  if (!code || u.searchParams.get("error") || Date.now() - Date.parse(st.created_at) > STATE_TTL) return back(origin, returnTo, "cancelled");

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: await secret(admin, "GOOGLE_CLIENT_ID"),
        client_secret: await secret(admin, "GOOGLE_CLIENT_SECRET"),
        // Exactly the address the Connect sent Google (Google checks).
        redirect_uri: knownRedirect(st.redirect_uri),
        grant_type: "authorization_code",
        ...(st.code_verifier ? { code_verifier: st.code_verifier } : {}),
      }),
    });
    const t = await res.json().catch(() => ({}));
    if (!res.ok || !t.access_token) {
      console.error("token exchange", res.status, t.error, t.error_description);
      return back(origin, returnTo, "error");
    }
    // Google lets people untick the calendar box on its page; without it
    // there's nothing we can do, so say so rather than "connected".
    const granted = String(t.scope || "").split(" ");
    if (!granted.includes(CALENDAR_SCOPE) && !granted.includes("https://www.googleapis.com/auth/calendar")) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.access_token)}`, { method: "POST" }).then((r) => r.body?.cancel()).catch(() => null);
      return back(origin, returnTo, "noscope");
    }

    // prompt=consent means a refresh token every time; if Google ever leaves
    // it out, keep the one we have (it still works).
    const { data: prev } = await admin.from("google_calendar_connections").select("refresh_token").eq("agent_id", st.agent_id).maybeSingle();
    const refreshSealed = t.refresh_token ? await seal(admin, t.refresh_token) : prev?.refresh_token;
    if (!refreshSealed) {
      console.error("no refresh token", st.agent_id);
      return back(origin, returnTo, "error");
    }

    // Their calendar's own time zone (an agent in Dubai isn't on Johannesburg time).
    const tz = await fetch(`${CAL_API}/calendars/primary/events?maxResults=1&fields=timeZone`, { headers: { Authorization: `Bearer ${t.access_token}` } })
      .then((r) => (r.ok ? r.json() : null)).then((j) => (typeof j?.timeZone === "string" ? j.timeZone : null)).catch(() => null);

    const email = emailFrom(t.id_token);
    const { error } = await admin.from("google_calendar_connections").upsert({
      agent_id: st.agent_id,
      google_email: email,
      refresh_token: refreshSealed,
      access_token: await seal(admin, t.access_token),
      expires_at: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString(),
      calendar_id: "primary",
      time_zone: tz,
      connected_at: new Date().toISOString(),
      needs_reconnect: false,
      last_error: null,
    });
    if (error) {
      console.error("save connection", error.message);
      return back(origin, returnTo, "error");
    }
    await admin.from("agent_profiles").update({ google_calendar_email: email || "connected" }).eq("agent_id", st.agent_id);

    // Everything coming up goes in, starting now (the cron finishes the rest).
    await admin.rpc("google_calendar_queue_upcoming", { p_agent: st.agent_id });
    inBackground((async () => {
      try {
        const sync = new CalendarSync(admin);
        const { data: rows } = await admin.rpc("google_calendar_claim", { p_limit: 40 });
        for (const q of (rows ?? []) as QueueRow[]) await sync.run(q);
        await sync.finish();
      } catch (err) {
        console.error("first sync", err);
      }
    })());

    return back(origin, returnTo, "connected");
  } catch (err) {
    console.error(err);
    return back(origin, returnTo, "error");
  }
});
