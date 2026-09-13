import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Record that an agent tapped Call from a WhatsApp action link, without signing
// in. Same token authorisation as log-outcome / lead-note. A call doesn't change
// the lead row, so the history trigger can't see it — this writes the event
// directly. Repeat taps within two minutes are dropped by the table's own
// dedupe trigger.

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
    const { token } = await req.json();
    if (!token) return json({ error: "token required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: tokenRow } = await admin
      .from("lead_share_tokens")
      .select("lead_id, agent_id, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (!tokenRow) return json({ error: "Invalid link" }, 404);
    if (new Date(tokenRow.expires_at) < new Date()) return json({ error: "Link expired" }, 410);

    const { data: lead } = await admin
      .from("leads")
      .select("id, agent_id")
      .eq("id", tokenRow.lead_id)
      .maybeSingle();
    if (!lead) return json({ error: "Lead not found" }, 404);
    if (lead.agent_id !== tokenRow.agent_id) return json({ error: "Not allowed" }, 403);

    const { error } = await admin.from("lead_events").insert({
      lead_id: lead.id,
      agent_id: lead.agent_id,
      actor_id: tokenRow.agent_id,
      event_type: "call",
      source: "action_link",
      device: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    });
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
