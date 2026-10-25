// Where Google sends an agent back after "Allow" on Connect your Google
// Calendar. Swaps Google's one-time code for lasting access, saves it,
// queues their upcoming appointments and call times, and sends them back to
// the dashboard (…?calendar=connected, or ?calendar=error).
// Public (Google calls it in the agent's browser); the one-time state makes
// it safe. Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the vault.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CALLBACK = `${SUPABASE_URL}/functions/v1/google-calendar-callback`;
const APP = "https://leads.estatekit.co";

async function secret(name: string): Promise<string> {
  const { data } = await admin.rpc("get_secret", { secret_name: name });
  return data || Deno.env.get(name) || "";
}

const back = (path: string, result: string) => {
  const url = new URL(path || "/setup", APP);
  url.searchParams.set("calendar", result);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
};

/** The email in Google's id_token (we asked for it with the "email" scope). */
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
  const state = u.searchParams.get("state") || "";
  const code = u.searchParams.get("code") || "";
  const { data: st } = await admin.from("google_oauth_states").select("agent_id, return_to, created_at").eq("state", state).maybeSingle();
  if (!st) return back("/setup", "error");
  await admin.from("google_oauth_states").delete().eq("state", state);
  const returnTo = st.return_to || "/setup";
  // They pressed Cancel on Google's page, or the code is too old.
  if (!code || u.searchParams.get("error") || Date.now() - Date.parse(st.created_at) > 3600_000) return back(returnTo, "cancelled");

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: await secret("GOOGLE_CLIENT_ID"),
        client_secret: await secret("GOOGLE_CLIENT_SECRET"),
        redirect_uri: CALLBACK,
        grant_type: "authorization_code",
      }),
    });
    const t = await res.json();
    if (!res.ok || !t.refresh_token) {
      console.error("token exchange", res.status, JSON.stringify(t).slice(0, 300));
      return back(returnTo, "error");
    }
    const email = emailFrom(t.id_token);
    const { error } = await admin.from("google_calendar_connections").upsert({
      agent_id: st.agent_id,
      google_email: email,
      refresh_token: t.refresh_token,
      access_token: t.access_token,
      expires_at: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString(),
      calendar_id: "primary",
      connected_at: new Date().toISOString(),
      last_error: null,
    });
    if (error) {
      console.error("save connection", error.message);
      return back(returnTo, "error");
    }
    await admin.from("agent_profiles").update({ google_calendar_email: email || "connected" }).eq("agent_id", st.agent_id);

    // What's coming up goes in straight away.
    const now = new Date().toISOString();
    const { data: upcoming } = await admin
      .from("leads")
      .select("id, appointment_at, call_at")
      .eq("agent_id", st.agent_id)
      .eq("archived", false)
      .or(`appointment_at.gt.${now},call_at.gt.${now}`)
      .limit(500);
    const rows = (upcoming ?? []).flatMap((l: { id: string; appointment_at: string | null; call_at: string | null }) => [
      ...(l.appointment_at && l.appointment_at > now ? [{ lead_id: l.id, kind: "appointment" }] : []),
      ...(l.call_at && l.call_at > now ? [{ lead_id: l.id, kind: "call" }] : []),
    ]);
    if (rows.length) await admin.from("google_calendar_queue").upsert(rows, { onConflict: "lead_id,kind" });

    return back(returnTo, "connected");
  } catch (err) {
    console.error(err);
    return back(returnTo, "error");
  }
});
