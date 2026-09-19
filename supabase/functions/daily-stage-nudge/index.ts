import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// End-of-day nudge: one WhatsApp per agent listing how many leads still need
// their stage updated, with a link straight to the list.
//
// Deliberately scoped to TODAY'S work — leads that came in today and were never
// touched, plus reminders that have come due — not the whole backlog. Several
// agents carry 100+ untouched leads; "you have 155 leads to update" reads as
// noise and gets ignored, which defeats the point. A number an agent can
// actually clear before knocking off is one they'll act on.

const TEXTMEBOT_URL = "https://api.textmebot.com/send.php";
const APP_URL = "https://leads.estatekit.co";

// Stages that are finished or already parked at an outcome — nothing to update.
const SETTLED_STAGES = [
  "Lost",
  "Invalid Number",
  "Booked",
  "Mandate Signed",
  "Viewing Booked",
  "Offer Made",
  "Bought",
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function secret(supabase: SupabaseClient, name: string): Promise<string> {
  const { data } = await supabase.rpc("get_secret", { secret_name: name });
  return data || "";
}

async function sendWhatsApp(phone: string, text: string): Promise<boolean> {
  const apiKey = Deno.env.get("TEXTMEBOT_API_KEY");
  if (!apiKey) {
    console.error("TEXTMEBOT_API_KEY not configured — skipping send to", phone);
    return false;
  }
  const digits = phone.replace(/[^0-9]/g, "");
  const url = `${TEXTMEBOT_URL}?recipient=${digits}&apikey=${apiKey}&text=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error("TextMeBot send failed", phone, res.status, await res.text());
    return false;
  }
  return true;
}

/** Today's date in SAST (UTC+2, no DST) as YYYY-MM-DD. */
function todaySast(): string {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Start of the SAST day, as a UTC instant. */
function startOfTodaySastUtc(): string {
  return new Date(`${todaySast()}T00:00:00+02:00`).toISOString();
}

const FALLBACK_TEMPLATE =
  "Hi {{first_name}}, hope you're well.\n\n" +
  "You have {{count}} {{leads_word}} that still need updating.\n\n" +
  `Tap here to update them: ${APP_URL}/leads`;

function buildMessage(template: string, firstName: string, count: number): string {
  return template
    .replaceAll("{{first_name}}", firstName)
    .replaceAll("{{count}}", String(count))
    .replaceAll("{{leads_word}}", count === 1 ? "lead" : "leads");
}

/** The Automations screen owns this nudge: its row there is the on/off switch,
 *  and its step holds the wording. Returns null when it's switched off. */
async function loadDigestAutomation(
  supabase: SupabaseClient,
): Promise<{ name: string; template: string } | null> {
  const { data: automation } = await supabase
    .from("automations")
    .select("id, name, enabled")
    .eq("trigger_type", "daily_digest")
    .maybeSingle();

  // No row yet (migration not applied) or switched off — send nothing. Failing
  // closed matters here: this messages real agents.
  if (!automation?.enabled) return null;

  const { data: step } = await supabase
    .from("automation_steps")
    .select("template_text")
    .eq("automation_id", automation.id)
    .eq("step_order", 1)
    .maybeSingle();

  return { name: automation.name, template: step?.template_text || FALLBACK_TEMPLATE };
}

interface LeadCountRow { agent_id: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // `dryRun` reports who would be messaged without sending or recording
  // anything — used to sanity-check the wording and the numbers.
  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dryRun === true;
  } catch { /* no body is fine */ }

  // Checked before any work: if the automation is off, this is a no-op.
  const digest = await loadDigestAutomation(supabase);
  if (!digest && !dryRun) {
    return json({ sent: 0, note: "automation disabled — switch it on under Automations" });
  }
  const template = digest?.template ?? FALLBACK_TEMPLATE;

  const sentOn = todaySast();
  const dayStart = startOfTodaySastUtc();

  // Leads that arrived today and nobody has touched yet.
  const { data: newToday, error: newErr } = await supabase
    .from("leads")
    .select("agent_id")
    .eq("archived", false)
    .eq("stage", "New Lead")
    .gte("created_at", dayStart);

  // Reminders that have come due and are still sitting there.
  const { data: dueNow, error: dueErr } = await supabase
    .from("leads")
    .select("agent_id")
    .eq("archived", false)
    .eq("due", true)
    .not("reminder_at", "is", null)
    .lte("reminder_at", new Date().toISOString())
    .not("stage", "in", `(${SETTLED_STAGES.map((s) => `"${s}"`).join(",")})`);

  if (newErr || dueErr) {
    console.error(newErr ?? dueErr);
    return json({ error: (newErr ?? dueErr)!.message }, 500);
  }

  const counts = new Map<string, number>();
  for (const row of [...(newToday ?? []), ...(dueNow ?? [])] as LeadCountRow[]) {
    counts.set(row.agent_id, (counts.get(row.agent_id) ?? 0) + 1);
  }
  if (counts.size === 0) return json({ sent: 0, skipped: 0, note: "nothing outstanding" });

  const { data: profiles } = await supabase
    .from("agent_profiles")
    .select("agent_id, display_name, whatsapp_number, automations_paused")
    .in("agent_id", [...counts.keys()]);

  const results: { agent: string; count: number; status: string }[] = [];
  let sent = 0;

  for (const profile of profiles ?? []) {
    const count = counts.get(profile.agent_id) ?? 0;
    const name = profile.display_name || "there";
    if (count === 0) continue;

    if (profile.automations_paused) {
      results.push({ agent: name, count, status: "skipped — account paused" });
      continue;
    }
    if (!profile.whatsapp_number) {
      results.push({ agent: name, count, status: "skipped — no WhatsApp number" });
      continue;
    }

    if (dryRun) {
      results.push({
        agent: name,
        count,
        status: digest ? "would send" : "would send (automation currently OFF)",
      });
      continue;
    }

    // Claim the day for this agent first. A duplicate key means they've already
    // been nudged today (cron double-fire, manual re-run) — never message twice.
    const { error: claimErr } = await supabase
      .from("agent_daily_nudges")
      .insert({ agent_id: profile.agent_id, sent_on: sentOn, lead_count: count });
    if (claimErr) {
      results.push({ agent: name, count, status: "skipped — already nudged today" });
      continue;
    }

    const ok = await sendWhatsApp(profile.whatsapp_number, buildMessage(template, name.split(" ")[0], count));
    if (ok) {
      sent++;
      results.push({ agent: name, count, status: "sent" });
    } else {
      // Release the claim so a later retry can still reach them today.
      await supabase.from("agent_daily_nudges").delete()
        .eq("agent_id", profile.agent_id).eq("sent_on", sentOn);
      results.push({ agent: name, count, status: "send failed" });
    }
  }

  if (!dryRun && sent > 0) {
    const webhook = await secret(supabase, "DISCORD_ACTIVITY_WEBHOOK");
    if (webhook) {
      const lines = results.filter((r) => r.status === "sent").map((r) => `• ${r.agent} — ${r.count}`);
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "EstateKit Activity",
          embeds: [{
            title: "📋  End-of-day stage nudge",
            description: `Reminded ${sent} agent${sent === 1 ? "" : "s"} to update their leads.\n${lines.join("\n")}`,
            color: 0x1e88e5,
            timestamp: new Date().toISOString(),
          }],
        }),
      }).catch(() => {});
    }
  }

  return json({ sent, dryRun, results });
});
