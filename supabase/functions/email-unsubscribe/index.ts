// Unsubscribe from workflow emails: the link at the bottom of each one,
//   leads.estatekit.co/unsubscribe/<lead id>/<signature>
// opens a page that posts { l, s } here. The signature is an HMAC of the lead
// id (made in run-automations/workflows.ts), so a guessed or edited link does
// nothing. Sets leads.email_opt_out; workflows then skip their emails.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function signature(leadId: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`unsub:${leadId}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const b = await req.json();
    const id = String(b?.l || "");
    const sig = String(b?.s || "");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{32}$/.test(sig)) return json({ error: "bad link" }, 400);
    if (sig !== (await signature(id))) return json({ error: "bad link" }, 400);

    const { data: lead } = await supabase.from("leads").select("id, agent_id, email_opt_out").eq("id", id).maybeSingle();
    if (!lead) return json({ ok: true });
    if (!lead.email_opt_out) {
      await supabase.from("leads").update({ email_opt_out: true }).eq("id", id);
      await supabase.from("lead_events").insert({
        lead_id: id, agent_id: lead.agent_id, event_type: "email_unsubscribed", to_value: "Unsubscribed from emails", source: "automation",
      });
    }
    return json({ ok: true });
  } catch (e) {
    console.error("unsubscribe failed", e);
    return json({ error: "failed" }, 500);
  }
});
