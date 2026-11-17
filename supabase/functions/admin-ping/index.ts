import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { waDigits } from "../_shared/phone.ts";

// A private line for sending Kieran a WhatsApp — a short heads-up from a build
// session, a "this is live now", a "needs your eyes" nudge.
//
//   POST { secret, text }  → sends `text` on WhatsApp to the admin number.
//
// Two things keep it safe no matter who finds the URL:
//   1. The recipient is hardcoded to the admin number below, so the most this
//      can ever do is message that one phone — never a client, never anyone
//      else. There is no "to" field to abuse.
//   2. It only acts on the right shared secret (ADMIN_PING_SECRET in the
//      vault). A wrong or missing one is turned away.

const ADMIN_WHATSAPP = "264858149056"; // Kieran, the only recipient this can reach.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function send(text: string): Promise<boolean> {
  const apiKey = Deno.env.get("TEXTMEBOT_API_KEY");
  if (!apiKey) { console.error("TEXTMEBOT_API_KEY not configured"); return false; }
  const url = `https://api.textmebot.com/send.php?recipient=${waDigits(ADMIN_WHATSAPP)}&apikey=${apiKey}&text=${encodeURIComponent(text)}`;
  // TextMeBot allows one message every 5 seconds across the whole account; if
  // an automation just sent one, wait the window out and try once more.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url);
    if (res.ok) return true;
    const body = await res.text();
    console.error("admin-ping send failed", res.status, body.replace(/apikey=\S+/gi, ""));
    if (!/per \d+ seconds?/i.test(body)) return false;
    await new Promise((r) => setTimeout(r, 6_000));
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const expected = Deno.env.get("ADMIN_PING_SECRET");
  if (!expected) return json({ error: "not-configured" }, 503);

  const { secret, text } = await req.json().catch(() => ({ secret: "", text: "" }));
  if (secret !== expected) return json({ error: "nope" }, 403);
  if (typeof text !== "string" || !text.trim() || text.length > 2000) {
    return json({ error: "need text (1-2000 chars)" }, 400);
  }

  const ok = await send(text.trim());
  return ok ? json({ sent: true }) : json({ sent: false }, 502);
});
