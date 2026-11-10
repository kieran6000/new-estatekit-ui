import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { waDigits } from "../_shared/phone.ts";
import { pingMessage } from "./message.ts";

// A to-do or note on a client was given to someone on the team: tell them on
// WhatsApp, from the business number (TextMeBot).
//
//   POST { id, preview: true }  staff only: the message as we'd write it,
//                               for the person to edit. Sends nothing.
//   POST { id, text }           staff only: sends exactly that text.

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const APP = "https://leads.estatekit.co";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function send(phone: string, text: string): Promise<boolean> {
  const apiKey = Deno.env.get("TEXTMEBOT_API_KEY");
  if (!apiKey) { console.error("TEXTMEBOT_API_KEY not configured"); return false; }
  const url = `https://api.textmebot.com/send.php?recipient=${waDigits(phone)}&apikey=${apiKey}&text=${encodeURIComponent(text)}`;
  // TextMeBot takes one message every 5 seconds on the whole account; if an
  // automation just sent one, wait and try once more.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url);
    if (res.ok) return true;
    const body = await res.text();
    console.error("TextMeBot send failed", res.status, body.replace(/apikey=\S+/gi, ""));
    if (!/per \d+ seconds?/i.test(body)) return false;
    await new Promise((r) => setTimeout(r, 6_000));
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await supabase.auth.getUser(token);
  const uid = who?.user?.id;
  if (!uid) return json({ error: "Not signed in" }, 401);
  const { data: me } = await supabase.from("agent_profiles").select("is_operator, display_name").eq("agent_id", uid).maybeSingle();
  if (me?.is_operator !== true) return json({ error: "Not allowed" }, 403);

  const { id, preview, text: edited } = await req.json().catch(() => ({}));
  if (typeof id !== "string") return json({ error: "Missing id" }, 400);
  if (!preview && (typeof edited !== "string" || !edited.trim() || edited.length > 2000)) return json({ error: "Missing message" }, 400);
  const cols = "id, agent_id, kind, body, assigned_to, due_on, pinged_to, done_at";
  let { data: n, error: e1 } = await supabase.from("client_notes").select(`${cols}, num`).eq("id", id).maybeSingle();
  // Before the number column exists.
  if (e1) ({ data: n } = await supabase.from("client_notes").select(cols).eq("id", id).maybeSingle());
  if (!n) return json({ error: "Not found" }, 404);
  if (!n.assigned_to) return json({ sent: false, reason: "nobody to tell" });

  const [{ data: to }, { data: client }] = await Promise.all([
    supabase.from("agent_profiles").select("display_name, whatsapp_number, is_operator").eq("agent_id", n.assigned_to).maybeSingle(),
    supabase.from("agent_profiles").select("display_name").eq("agent_id", n.agent_id).maybeSingle(),
  ]);
  // Only ever someone on the team.
  if (to?.is_operator !== true) return json({ error: "Not on the team" }, 400);
  if (!waDigits(to.whatsapp_number)) return json({ sent: false, reason: "no number" });

  const first = (s: string | null | undefined, or: string) => (s ?? "").trim().split(/\s+/)[0] || or;
  const num = (n as { num?: number | null }).num ?? null;
  const text = pingMessage({
    kind: n.kind === "note" ? "note" : "todo",
    to: first(to.display_name, "there"),
    from: first(me.display_name, "EstateKit"),
    client: (client?.display_name ?? "a client").trim(),
    body: n.body,
    due: n.kind === "todo" ? n.due_on : null,
    today: new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }),
    num,
    link: `${APP}/t/${num ?? n.id.slice(0, 8)}`,
  });

  if (preview) return json({ text });
  const ok = await send(to.whatsapp_number, edited.trim());
  if (!ok) return json({ sent: false, reason: "send failed" });
  await supabase.from("client_notes").update({ pinged_to: n.assigned_to, pinged_at: new Date().toISOString() }).eq("id", n.id);
  return json({ sent: true });
});
