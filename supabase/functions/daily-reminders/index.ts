// Scheduled daily (pg_cron, ~07:00 SAST) — see migration 0002_cron.sql.
// For every agent: leads that are due today (reminder_at <= today, or never-contacted
// "New Lead"s) get rolled into one WhatsApp message via TextMeBot.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

async function sendWhatsApp(phone: string, text: string): Promise<void> {
  const endpoint = Deno.env.get("TEXTMEBOT_ENDPOINT");
  const apiKey = Deno.env.get("TEXTMEBOT_API_KEY");
  if (!endpoint || !apiKey) {
    console.error("TextMeBot not configured — skipping send to", phone);
    return;
  }
  const url = new URL(endpoint);
  url.searchParams.set("recipient", phone);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("text", text);
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    console.error("TextMeBot send failed", phone, res.status, await res.text());
  }
}

const DEAD = ["Lost", "Invalid Number"];
const PARKED = ["Booked", "Mandate Signed"];

Deno.serve(async (req: Request) => {
  const auth = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (auth !== `Bearer ${serviceKey}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey,
  );

  // Wake up follow-ups whose reminder day has arrived — this is what actually
  // resurfaces a lead on the app's "to call today" band, not just the WhatsApp ping.
  const { error: wakeErr } = await supabase
    .from("leads")
    .update({ due: true })
    .in("stage", ["Contacted", "No Answer"])
    .eq("due", false)
    .lte("reminder_at", new Date().toISOString());
  if (wakeErr) console.error("wake-up update failed", wakeErr);

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, agent_id, name, stage, due")
    .eq("due", true)
    .not("stage", "in", `(${[...DEAD, ...PARKED].map((s) => `"${s}"`).join(",")})`);

  if (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const byAgent = new Map<string, { name: string }[]>();
  for (const l of leads ?? []) {
    if (!byAgent.has(l.agent_id)) byAgent.set(l.agent_id, []);
    byAgent.get(l.agent_id)!.push({ name: l.name });
  }

  let sent = 0;
  for (const [agentId, agentLeads] of byAgent) {
    const { data: profile } = await supabase
      .from("agent_profiles")
      .select("whatsapp_number, display_name")
      .eq("agent_id", agentId)
      .maybeSingle();

    if (!profile?.whatsapp_number) continue;

    const hottest = agentLeads.slice(0, 5).map((l) => l.name).join(", ");
    const n = agentLeads.length;
    const msg = `EstateKit: you have ${n} lead${n === 1 ? "" : "s"} to call today.\n${hottest}${n > 5 ? ` +${n - 5} more` : ""}`;
    await sendWhatsApp(profile.whatsapp_number, msg);
    sent++;
  }

  return new Response(JSON.stringify({ agentsNotified: sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
