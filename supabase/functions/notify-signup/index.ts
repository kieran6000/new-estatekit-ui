// Tells the admin about a new free-account request from /start.
//
// Called by the database (trigger on signup_requests, via pg_net) with
// { id }. Safe to be public: it only acts on a request that is under 15
// minutes old and hasn't been announced yet, and it marks it announced first,
// so calling it again (or guessing ids) does nothing.
//
// Sends:
//   - a WhatsApp to the admin number via TextMeBot (TEXTMEBOT_API_KEY)
//   - a Discord card to DISCORD_SIGNUP_WEBHOOK (vault), falling back to
//     DISCORD_ACTIVITY_WEBHOOK
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Keep in step with src/lib/contact.ts.
const ADMIN_WHATSAPP = "264858149056";
const APP = "https://leads.estatekit.co";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function secret(name: string): Promise<string> {
  const { data } = await supabase.rpc("get_secret", { secret_name: name });
  return data || "";
}

async function sendWhatsApp(to: string, text: string): Promise<string> {
  const apiKey = Deno.env.get("TEXTMEBOT_API_KEY");
  if (!apiKey) return "not_configured";
  const url = `https://api.textmebot.com/send.php?recipient=${to}&apikey=${apiKey}&text=${encodeURIComponent(text)}`;
  // TextMeBot allows one message per 5s per account, shared with the
  // automations. One retry after the window covers a collision.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url);
    if (res.ok) return "sent";
    const body = await res.text();
    console.error("TextMeBot send failed", res.status, body);
    if (!/messages? per \d+ seconds?/i.test(body)) return "failed";
    await new Promise((r) => setTimeout(r, 6000));
  }
  return "rate_limited";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let id = "";
  try {
    id = String((await req.json())?.id || "");
  } catch { /* fall through */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "bad id" }, 400);

  // Claim it: only one caller ever gets the row back.
  const { data: rows, error } = await supabase
    .from("signup_requests")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", id)
    .is("notified_at", null)
    .gt("created_at", new Date(Date.now() - 15 * 60_000).toISOString())
    .select("name, whatsapp, email, agency, wants, city, suburbs, budget, ref, source");
  if (error) {
    console.error("claim failed", error);
    return json({ error: "claim failed" }, 500);
  }
  const r = rows?.[0];
  if (!r) return json({ ok: true, skipped: "already sent or too old" });

  const via = r.ref ? `/p/${r.ref}${r.source === "thank_you" ? " (thank-you page)" : ""}` : "direct";
  const lines = [
    `🆕 *New EstateKit sign-up request*`,
    ``,
    `*${r.name}*${r.agency ? ` · ${r.agency}` : ""}`,
    `📱 ${r.whatsapp}`,
    r.email ? `✉️ ${r.email}` : "",
    `🎯 ${(r.wants || []).join(", ") || "—"}`,
    `📍 ${[r.city, r.suburbs].filter(Boolean).join(": ") || "—"}`,
    `💰 Budget: ${r.budget || "—"}`,
    `🔗 Came from: ${via}`,
    ``,
    `Reply to them: https://wa.me/${String(r.whatsapp).replace(/\D/g, "")}`,
    `All requests: ${APP}/admin/clients`,
  ].filter((l) => l !== "");

  const whatsapp = await sendWhatsApp(ADMIN_WHATSAPP, lines.join("\n"));

  let discord = "not_configured";
  const hook = (await secret("DISCORD_SIGNUP_WEBHOOK")) || (await secret("DISCORD_ACTIVITY_WEBHOOK"));
  if (hook) {
    try {
      const res = await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: `🆕 Sign-up request: ${r.name}`,
            url: `${APP}/admin/clients`,
            color: 0x1976d2,
            fields: [
              { name: "Agency", value: r.agency || "—", inline: true },
              { name: "WhatsApp", value: r.whatsapp, inline: true },
              { name: "Email", value: r.email || "—", inline: true },
              { name: "Wants", value: (r.wants || []).join(", ") || "—", inline: true },
              { name: "Budget", value: r.budget || "—", inline: true },
              { name: "Came from", value: via, inline: true },
              { name: "Area", value: [r.city, r.suburbs].filter(Boolean).join(": ") || "—" },
            ],
            timestamp: new Date().toISOString(),
          }],
        }),
      });
      discord = res.ok ? "sent" : `failed ${res.status}`;
    } catch (e) {
      console.error("discord failed", e);
      discord = "failed";
    }
  }

  console.log("signup notified", id, { whatsapp, discord });
  return json({ ok: true, whatsapp, discord });
});
