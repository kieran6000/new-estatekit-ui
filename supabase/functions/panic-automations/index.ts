import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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
    const authHeader = req.headers.get("Authorization") || "";
    // Identify the caller from their JWT.
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await asUser.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Not signed in" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: prof } = await admin
      .from("agent_profiles")
      .select("is_operator")
      .eq("agent_id", uid)
      .maybeSingle();
    if (!prof?.is_operator) return json({ error: "Operators only" }, 403);

    // Stop everything: disable automations and cancel anything queued/in-flight.
    await admin.from("automations").update({ enabled: false }).eq("enabled", true);
    const { data: cancelled } = await admin
      .from("automation_runs")
      .update({ status: "cancelled" })
      .in("status", ["pending", "processing"])
      .select("id");

    return json({ ok: true, cancelled: cancelled?.length ?? 0 });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
