// Google Calendar, for the signed-in agent (their own Google account):
//   { action: "connect", returnTo }  → { url }: Google's "allow access" page.
//     Google then sends them to google-calendar-callback, which saves it.
//   { action: "disconnect" }         → stops it and tells Google to forget us.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the vault.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CALLBACK = `${SUPABASE_URL}/functions/v1/google-calendar-callback`;
// Only what we need: put events in their calendar. Plus who they are (email).
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function secret(name: string): Promise<string> {
  const { data } = await admin.rpc("get_secret", { secret_name: name });
  return data || Deno.env.get(name) || "";
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
      const clientId = await secret("GOOGLE_CLIENT_ID");
      // Answered normally (not an error code), so the app can say it plainly.
      if (!clientId) return json({ error: "not_configured" });
      const state = [...crypto.getRandomValues(new Uint8Array(24))].map((x) => x.toString(16).padStart(2, "0")).join("");
      const returnTo = typeof b.returnTo === "string" && b.returnTo.startsWith("/") ? b.returnTo.slice(0, 200) : "/setup";
      await admin.from("google_oauth_states").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());
      const { error } = await admin.from("google_oauth_states").insert({ state, agent_id: me, return_to: returnTo });
      if (error) return json({ error: "state" }, 500);
      const q = new URLSearchParams({
        client_id: clientId,
        redirect_uri: CALLBACK,
        response_type: "code",
        scope: SCOPES.join(" "),
        access_type: "offline",
        // Always ask, so Google hands over a lasting key (a refresh token).
        prompt: "consent",
        include_granted_scopes: "true",
        state,
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
    }

    if (b.action === "disconnect") {
      const { data: c } = await admin.from("google_calendar_connections").select("refresh_token").eq("agent_id", me).maybeSingle();
      if (c?.refresh_token) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(c.refresh_token)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }).catch(() => null);
      }
      await admin.from("google_calendar_connections").delete().eq("agent_id", me);
      await admin.from("google_calendar_events").delete().eq("agent_id", me);
      await admin.from("agent_profiles").update({ google_calendar_email: null }).eq("agent_id", me);
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: "server" }, 500);
  }
});
