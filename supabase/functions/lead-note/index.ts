import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Save a lead's note from a WhatsApp action link, without signing in. The share
// token authorises the write and scopes it to that one lead (same pattern as
// log-outcome).

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
    const { token, note } = await req.json();
    if (!token || typeof note !== "string") return json({ error: "token and note required" }, 400);
    if (note.length > 5000) return json({ error: "Note too long" }, 400);

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

    // Tag the write so the lead history shows the agent, via their WhatsApp link.
    const writer = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: {
        headers: {
          "x-ek-source": "action_link",
          "x-ek-actor": tokenRow.agent_id,
          "x-ek-device": (req.headers.get("user-agent") ?? "").slice(0, 300),
        },
      },
    });
    const { error } = await writer.from("leads").update({ note }).eq("id", lead.id);
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
