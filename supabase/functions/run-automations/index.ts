import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const BATCH_SIZE = 200;
const TEXTMEBOT_URL = "https://api.textmebot.com/send.php";
const APP_URL = "https://leads.estatekit.co";
const DISCORD_CLIENT_ACTIVITY = "https://discord.com/api/webhooks/1545010946647531660/JGPFITtjAXpove1j06lPUBrraqK5j0A_zm_0B7MAbTBpzr6qzSfG-NPigYtRGewpyMf-";

// Quiet hours: agents should never get a WhatsApp outside these local hours.
// SAST is UTC+2 year-round (no DST). Sends due outside the window are pushed
// to the next 08:00 SAST rather than fired at night.
const SAST_OFFSET_HOURS = 2;
const SEND_START_SAST = 8;   // inclusive
const SEND_END_SAST = 20;    // exclusive (last send at 19:59 SAST)

/** If now is inside quiet hours, returns the UTC Date to defer a send to;
 *  null means it's fine to send right now. */
function quietHoursDeferUntil(now: Date): Date | null {
  const sastHour = (now.getUTCHours() + SAST_OFFSET_HOURS) % 24;
  if (sastHour >= SEND_START_SAST && sastHour < SEND_END_SAST) return null;
  // Next 08:00 SAST == 06:00 UTC.
  const target = new Date(now);
  target.setUTCMinutes(0, 0, 0);
  target.setUTCHours((SEND_START_SAST - SAST_OFFSET_HOURS + 24) % 24);
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
  return target;
}

const LINK_TYPE_MAP: Record<string, string> = {
  "new lead": "first_touch",
  "first": "first_touch",
  "instant": "first_touch",
  "ping": "first_touch",
  "no answer": "retry_nudge",
  "retry": "retry_nudge",
  "nudge": "retry_nudge",
  "follow-up": "retry_nudge",
  "follow up": "retry_nudge",
  "contacted": "retry_nudge",
  "booked": "post_appointment",
  "appointment": "post_appointment",
  "appt": "post_appointment",
  "viewing": "post_appointment",
  "mandate": "post_appointment",
  "offer": "post_appointment",
  "snooze": "snooze_followup",
  "reminder": "snooze_followup",
};

function inferLinkType(automationName: string): string {
  const lower = automationName.toLowerCase();
  for (const [keyword, linkType] of Object.entries(LINK_TYPE_MAP)) {
    if (lower.includes(keyword)) return linkType;
  }
  return "first_touch";
}

async function sendWhatsApp(phone: string, text: string): Promise<void> {
  const apiKey = Deno.env.get("TEXTMEBOT_API_KEY");
  if (!apiKey) {
    console.error("TEXTMEBOT_API_KEY not configured — skipping send to", phone);
    return;
  }
  const digits = phone.replace(/[^0-9]/g, "");
  const url = `${TEXTMEBOT_URL}?recipient=${digits}&apikey=${apiKey}&text=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) console.error("TextMeBot send failed", phone, res.status, await res.text());
}

async function generateActionLink(
  supabase: SupabaseClient,
  leadId: string,
  agentId: string,
  linkType: string,
): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const { error } = await supabase.from("lead_share_tokens").insert({
    lead_id: leadId,
    agent_id: agentId,
    token,
    link_type: linkType,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) {
    console.error("Failed to insert share token", error.message);
    throw new Error(`Token insert failed: ${error.message}`);
  }
  return `${APP_URL}/l/${token}`;
}

async function fillTemplate(
  supabase: SupabaseClient,
  template: string,
  lead: { id: string; agent_id: string; name: string; phone: string; stage: string; next_label: string },
  linkType: string,
): Promise<string> {
  const firstName = lead.name.split(" ")[0];
  let text = template
    .replaceAll("{{name}}", lead.name)
    .replaceAll("{{first_name}}", firstName)
    .replaceAll("{{phone}}", lead.phone)
    .replaceAll("{{stage}}", lead.stage)
    .replaceAll("{{next_label}}", lead.next_label);

  if (text.includes("{{action_link}}")) {
    const link = await generateActionLink(supabase, lead.id, lead.agent_id, linkType);
    text = text.replaceAll("{{action_link}}", link);
  }
  return text;
}

async function logToDiscord(msg: string): Promise<void> {
  try {
    await fetch(DISCORD_CLIENT_ACTIVITY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: msg.slice(0, 2000) }),
    });
  } catch { /* best-effort */ }
}

interface RunRow {
  id: string;
  lead_id: string;
  automation_id: string;
  current_step: number;
}

async function processRun(supabase: SupabaseClient, run: RunRow) {
  const { data: lead } = await supabase
    .from("leads")
    .select("id, agent_id, name, phone, stage, next_label")
    .eq("id", run.lead_id)
    .maybeSingle();

  if (!lead) {
    await supabase.from("automation_runs").update({ status: "cancelled" }).eq("id", run.id);
    return;
  }

  const { data: step } = await supabase
    .from("automation_steps")
    .select("*")
    .eq("automation_id", run.automation_id)
    .eq("step_order", run.current_step)
    .maybeSingle();

  if (!step) {
    await supabase.from("automation_runs").update({ status: "completed" }).eq("id", run.id);
    return;
  }

  // Quiet hours only gate outbound WhatsApp. A send due at night is deferred to
  // the next morning (run kept pending, step not advanced) so no one is pinged
  // at 10pm. State-only steps (reminder/stage) still run anytime.
  if (step.action_type === "send_whatsapp") {
    const defer = quietHoursDeferUntil(new Date());
    if (defer) {
      await supabase
        .from("automation_runs")
        .update({ status: "pending", run_at: defer.toISOString() })
        .eq("id", run.id);
      return;
    }
  }

  const { data: automation } = await supabase
    .from("automations")
    .select("name")
    .eq("id", run.automation_id)
    .maybeSingle();

  const linkType = inferLinkType(automation?.name ?? "");

  try {
    if (step.action_type === "send_whatsapp" && step.template_text) {
      const { data: profile } = await supabase
        .from("agent_profiles")
        .select("whatsapp_number, display_name")
        .eq("agent_id", lead.agent_id)
        .maybeSingle();
      if (profile?.whatsapp_number) {
        const text = await fillTemplate(supabase, step.template_text, lead, linkType);
        await sendWhatsApp(profile.whatsapp_number, text);
        await logToDiscord(`\u{2699}\u{FE0F} Automation **${automation?.name}** sent WhatsApp to **${profile.display_name || profile.whatsapp_number}** re: ${lead.name}`);
        // Sending doesn't change the lead row, so the history trigger can't see it.
        await supabase.from("lead_events").insert({
          lead_id: lead.id,
          agent_id: lead.agent_id,
          event_type: "whatsapp_sent",
          to_value: automation?.name ?? "Automation",
          source: "automation",
        });
      }
    } else if (step.action_type === "set_reminder") {
      const payload = step.payload as { label?: string; offset_minutes?: number; due?: boolean };
      const offsetMin = payload.offset_minutes ?? 0;
      await supabase
        .from("leads")
        .update({
          next_label: payload.label ?? lead.next_label,
          reminder_at: new Date(Date.now() + offsetMin * 60000).toISOString(),
          due: payload.due ?? true,
        })
        .eq("id", lead.id);
    } else if (step.action_type === "set_stage") {
      const payload = step.payload as { stage?: string };
      if (payload.stage) await supabase.from("leads").update({ stage: payload.stage }).eq("id", lead.id);
    }
  } catch (e) {
    console.error("automation step failed", run.id, e);
  }

  const { data: nextStep } = await supabase
    .from("automation_steps")
    .select("delay_minutes")
    .eq("automation_id", run.automation_id)
    .eq("step_order", run.current_step + 1)
    .maybeSingle();

  if (nextStep) {
    await supabase
      .from("automation_runs")
      .update({
        current_step: run.current_step + 1,
        run_at: new Date(Date.now() + nextStep.delay_minutes * 60000).toISOString(),
        status: "pending",
      })
      .eq("id", run.id);
  } else {
    await supabase.from("automation_runs").update({ status: "completed" }).eq("id", run.id);
  }
}

Deno.serve(async (_req: Request) => {
  // Tagged so any stage an automation sets shows as "Automation" in lead history.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    global: { headers: { "x-ek-source": "automation" } },
  });

  const { data: due, error } = await supabase
    .from("automation_runs")
    .select("id, lead_id, automation_id, current_step")
    .eq("status", "pending")
    .lte("run_at", new Date().toISOString())
    .limit(BATCH_SIZE);

  if (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let processed = 0;
  for (const run of due ?? []) {
    const { data: claimed } = await supabase
      .from("automation_runs")
      .update({ status: "processing" })
      .eq("id", run.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    await processRun(supabase, run as RunRow);
    processed++;
  }

  return new Response(JSON.stringify({ processed }), { headers: { "Content-Type": "application/json" } });
});
