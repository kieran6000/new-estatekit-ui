import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Weekly reports for agents (Accounts → Weekly reports).
//
//   { action: "send", agentId, weekStart, period, data }   operator only
//     Saves the report exactly as the CSM sees it (data), mints a private
//     link and WhatsApps it to the agent from the EstateKit number.
//   { action: "view", token }                               anyone with the link
//     Returns the saved report and counts the open, unless an operator is
//     the one looking (the CSM previewing must not read as "agent opened it").
//
// verify_jwt is off because "view" is opened by agents who aren't signed in;
// "send" checks the caller's sign-in and operator flag itself.

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};
const APP = "https://leads.estatekit.co";
const TEXTMEBOT_URL = "https://api.textmebot.com/send.php";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function caller(req: Request): Promise<{ id: string; isOperator: boolean; name: string } | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const { data } = await supabase.auth.getUser(token);
    const id = data.user?.id;
    if (!id) return null;
    const { data: p } = await supabase.from("agent_profiles").select("is_operator, display_name").eq("agent_id", id).maybeSingle();
    return { id, isOperator: !!p?.is_operator, name: p?.display_name ?? "" };
  } catch {
    return null;
  }
}

async function sendWhatsApp(phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get("TEXTMEBOT_API_KEY");
  if (!apiKey) return { ok: false, error: "WhatsApp sending isn't set up (TEXTMEBOT_API_KEY)." };
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length < 9) return { ok: false, error: "This agent has no valid WhatsApp number." };
  const url = `${TEXTMEBOT_URL}?recipient=${digits}&apikey=${apiKey}&text=${encodeURIComponent(text)}`;
  // TextMeBot allows one message per ~5s per account. One retry covers a
  // clash with an automation alert going out at the same moment.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url);
    const body = await res.text();
    if (res.ok) return { ok: true };
    if (attempt === 0 && /messages? per \d+ seconds?/i.test(body)) { await new Promise((r) => setTimeout(r, 6000)); continue; }
    console.error("TextMeBot send failed", res.status, body.slice(0, 300));
    return { ok: false, error: "WhatsApp didn't accept the message. Try again in a minute." };
  }
  return { ok: false, error: "WhatsApp is busy. Try again in a minute." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }

  if (body.action === "view") {
    const token = String(body.token ?? "");
    if (!/^[0-9a-f]{32}$/.test(token)) return json({ error: "not_found" }, 404);
    const { data: row } = await supabase
      .from("weekly_report_sends")
      .select("id, agent_id, period, data, first_opened_at, open_count")
      .eq("token", token)
      .maybeSingle();
    if (!row) return json({ error: "not_found" }, 404);
    const { data: p } = await supabase.from("agent_profiles").select("display_name, avatar_url").eq("agent_id", row.agent_id).maybeSingle();

    const who = await caller(req);
    if (!who?.isOperator) {
      const now = new Date().toISOString();
      await supabase
        .from("weekly_report_sends")
        .update({ first_opened_at: row.first_opened_at ?? now, last_opened_at: now, open_count: (row.open_count ?? 0) + 1 })
        .eq("id", row.id);
    }
    return json({ period: row.period, data: row.data, name: p?.display_name ?? "", avatarUrl: p?.avatar_url ?? null });
  }

  if (body.action === "send") {
    const who = await caller(req);
    if (!who?.isOperator) return json({ error: "Only EstateKit staff can send reports." }, 403);

    const agentId = String(body.agentId ?? "");
    const weekStart = String(body.weekStart ?? "");
    const period = String(body.period ?? "").slice(0, 80);
    if (!/^[0-9a-f-]{36}$/.test(agentId) || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !period || typeof body.data !== "object" || !body.data) {
      return json({ error: "Bad request" }, 400);
    }
    const { data: agent } = await supabase.from("agent_profiles").select("display_name, whatsapp_number").eq("agent_id", agentId).maybeSingle();
    if (!agent) return json({ error: "Agent not found" }, 404);

    const token = crypto.randomUUID().replace(/-/g, "");
    const { data: row, error } = await supabase
      .from("weekly_report_sends")
      .insert({ agent_id: agentId, week_start: weekStart, period, data: body.data, token, sent_by: who.id, sent_by_name: who.name, status: "sending" })
      .select("id")
      .single();
    if (error || !row) {
      console.error("insert failed", error);
      const missing = /relation .*weekly_report_sends.* does not exist|schema cache/i.test(error?.message ?? "");
      return json({ error: missing ? "The weekly reports table isn't set up yet." : "Couldn't save the report." }, 500);
    }

    const first = (agent.display_name || "there").trim().split(/\s+/)[0];
    const text = `Hi ${first}, your EstateKit weekly report for ${period} is ready:\n${APP}/r/${token}`;
    const sent = await sendWhatsApp(agent.whatsapp_number ?? "", text);
    await supabase
      .from("weekly_report_sends")
      .update({ status: sent.ok ? "sent" : "failed", error: sent.error ?? null })
      .eq("id", row.id);
    if (!sent.ok) return json({ error: sent.error, id: row.id }, 502);
    return json({ ok: true, id: row.id });
  }

  return json({ error: "Unknown action" }, 400);
});
