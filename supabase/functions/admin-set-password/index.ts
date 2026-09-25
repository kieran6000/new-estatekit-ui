import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Operator-only password reset. Passwords are bcrypt-hashed, so they can never
// be read back — an operator can only set a new one.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Identify the caller from their bearer token. Verified with the service
    // client so this doesn't depend on the anon key being present in the env.
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Not signed in" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (userErr || !uid) return json({ error: "Not signed in" }, 401);

    const { data: me, error: meErr } = await admin
      .from("agent_profiles").select("is_operator").eq("agent_id", uid).maybeSingle();
    if (meErr) return json({ error: `Profile lookup failed: ${meErr.message}` }, 500);
    if (!me?.is_operator) return json({ error: "Operators only" }, 403);

    const body = await req.json().catch(() => null);
    const agentId = body?.agentId;
    const newPassword = body?.newPassword;
    if (!agentId || !newPassword) return json({ error: "agentId and newPassword required" }, 400);
    if (String(newPassword).length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    // Make sure the target is a real agent in this system before touching auth.
    const { data: target } = await admin
      .from("agent_profiles").select("agent_id, display_name").eq("agent_id", agentId).maybeSingle();
    if (!target) return json({ error: "Unknown agent" }, 404);

    const { error } = await admin.auth.admin.updateUserById(String(agentId), {
      password: String(newPassword),
    });
    if (error) return json({ error: `Couldn't set password: ${error.message}` }, 500);

    return json({ ok: true, displayName: target.display_name });
  } catch (err) {
    console.error("admin-set-password failed:", err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
