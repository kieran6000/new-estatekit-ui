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
    // Only operators may create agents.
    const authHeader = req.headers.get("Authorization") || "";
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: udata } = await asUser.auth.getUser();
    const uid = udata?.user?.id;
    if (!uid) return json({ error: "Not signed in" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: caller } = await admin.from("agent_profiles").select("is_operator").eq("agent_id", uid).maybeSingle();
    if (!caller?.is_operator) return json({ error: "Operators only" }, 403);

    const b = await req.json();
    const digits = String(b.phone || "").replace(/\D/g, "");
    if (!digits || !b.password || !b.displayName) return json({ error: "phone, password and displayName are required" }, 400);
    const email = `${digits}@estatekit.app`;

    // Create the auth user (phone+password via synthetic email).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: String(b.password),
      email_confirm: true,
      phone: `+${digits}`,
      user_metadata: { display_name: b.displayName },
    });
    if (createErr || !created?.user) {
      return json({ error: createErr?.message || "Could not create user" }, 400);
    }
    const agentId = created.user.id;

    // Profile
    const { error: profErr } = await admin.from("agent_profiles").upsert({
      agent_id: agentId,
      display_name: b.displayName,
      email: b.email || "",
      whatsapp_number: `+${digits}`,
      area: b.area || "",
      company: b.company || "",
      is_operator: false,
      fb_page_id: b.fbPageId || "",
      fb_ad_account_id: b.fbAdAccountId || "",
    });
    if (profErr) return json({ error: `Profile: ${profErr.message}`, agentId }, 500);

    // Default pipelines (Seller + Buyer), matching every other agent.
    const { error: pipeErr } = await admin.from("pipelines").insert([
      { agent_id: agentId, name: "Seller", kind: "seller" },
      { agent_id: agentId, name: "Buyer", kind: "buyer" },
    ]);
    if (pipeErr) return json({ error: `Pipelines: ${pipeErr.message}`, agentId }, 500);

    return json({ ok: true, agentId, email });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
