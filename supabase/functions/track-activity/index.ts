import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

const APP = "https://leads.estatekit.co";
const EK_LOGO = "https://leads.estatekit.co/favicon.svg";

type EventKey =
  | "login" | "new_lead" | "form_submitted" | "lead_disqualified" | "stage_change"
  | "call_started" | "note_added" | "lead_page_created" | "lead_page_deleted" | "sold_listing_added";

const EVENTS: Record<EventKey, { emoji: string; label: string; color: number; cat: string }> = {
  login:              { emoji: "🔓", label: "Signed in",            color: 0x6366f1, cat: "Agent" },
  new_lead:           { emoji: "📥", label: "New lead",             color: 0x22c55e, cat: "Lead" },
  form_submitted:     { emoji: "📥", label: "New lead",             color: 0x22c55e, cat: "Lead" },
  lead_disqualified:  { emoji: "🚫", label: "Lead disqualified",    color: 0x9ca3af, cat: "Lead" },
  stage_change:       { emoji: "🔀", label: "Lead stage changed",   color: 0x3b82f6, cat: "Lead" },
  call_started:       { emoji: "📞", label: "Called a lead",        color: 0x14b8a6, cat: "Agent" },
  note_added:         { emoji: "📝", label: "Added a note",         color: 0x64748b, cat: "Agent" },
  lead_page_created:  { emoji: "✨", label: "Created a lead page",   color: 0x8b5cf6, cat: "Page" },
  lead_page_deleted:  { emoji: "🗑️", label: "Deleted a lead page",  color: 0x8b5cf6, cat: "Page" },
  sold_listing_added: { emoji: "🏡", label: "Added a recent sale",  color: 0xf59e0b, cat: "Page" },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function secret(name: string): Promise<string> {
  const { data } = await supabase.rpc("get_secret", { secret_name: name });
  return data || "";
}

function deviceLabel(ua: string): string {
  if (!ua) return "";
  const tablet = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua);
  const mobile = /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua);
  const os = /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android"
    : /Windows/i.test(ua) ? "Windows" : /Mac OS X|Macintosh/i.test(ua) ? "macOS"
    : /Linux/i.test(ua) ? "Linux" : "Unknown";
  return `${tablet ? "📱 Tablet" : mobile ? "📱 Phone" : "💻 Desktop"} · ${os}`;
}

function flagOf(cc?: string): string {
  if (!cc || cc.length !== 2) return "";
  return String.fromCodePoint(...cc.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
}

async function geoFor(ip: string): Promise<{ label: string; ip: string } | null> {
  if (!ip) return null;
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`);
    const d = await r.json();
    if (d && !d.error) {
      const label = `${flagOf(d.country_code)} ${[d.city, d.region, d.country_name].filter(Boolean).join(", ")}`.trim();
      return { label: label || "—", ip };
    }
  } catch { /* ignore */ }
  return { label: "—", ip };
}

interface Field { name: string; value: string; inline?: boolean }

/** The same kind of link an agent gets on WhatsApp (/l/{token}, no sign-in
 *  needed) — not the internal /leads/{id} dashboard route, which only works
 *  if you're already signed in as that specific agent. */
async function leadShareLink(leadId: string, agentId: string): Promise<string | null> {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const { error } = await supabase.from("lead_share_tokens").insert({
    lead_id: leadId,
    agent_id: agentId,
    token,
    link_type: "first_touch",
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) {
    console.error("leadShareLink: token insert failed", error.message);
    return null;
  }
  return `${APP}/l/${token}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const b = await req.json();
    const cfg = EVENTS[b.event as EventKey];
    if (!cfg) return json({ error: "unknown event" }, 400);

    const webhook = await secret("DISCORD_ACTIVITY_WEBHOOK");
    if (!webhook) return json({ ok: true, skipped: "no webhook configured" });

    // Agent identity for the author line + thumbnail.
    let agentName = b.actorName || "Someone";
    let company = "";
    let logo = "";
    if (b.agentId) {
      const { data: prof } = await supabase
        .from("agent_profiles")
        .select("display_name, company, sidebar_logo_url")
        .eq("agent_id", b.agentId)
        .maybeSingle();
      if (prof) {
        agentName = prof.display_name || agentName;
        company = prof.company || "";
        logo = prof.sidebar_logo_url || "";
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const fields: Field[] = [];

    const lead = b.lead || {};
    if (lead.name) fields.push({ name: "Lead", value: String(lead.name), inline: true });
    if (lead.phone) fields.push({ name: "Phone", value: String(lead.phone), inline: true });
    if (lead.pipeline) fields.push({ name: "Pipeline", value: String(lead.pipeline), inline: true });
    if (lead.address) fields.push({ name: "Address", value: String(lead.address), inline: false });
    if (b.event === "stage_change" && lead.fromStage && lead.toStage) {
      fields.push({ name: "Stage", value: `\`${lead.fromStage}\` → **${lead.toStage}**`, inline: false });
    } else if (lead.stage) {
      fields.push({ name: "Stage", value: String(lead.stage), inline: true });
    }
    if (lead.source) fields.push({ name: "Source", value: String(lead.source), inline: true });
    if (b.event === "lead_disqualified" && lead.reason) fields.push({ name: "Reason", value: String(lead.reason), inline: false });

    const page = b.page || {};
    if (page.name) fields.push({ name: "Page", value: String(page.name), inline: true });
    if (page.slug) fields.push({ name: "Link", value: `${APP}/p/${page.slug}`, inline: false });

    const sale = b.sale || {};
    if (sale.address) fields.push({ name: "Sold", value: `${sale.address}${sale.price ? ` — R${Number(sale.price).toLocaleString("en-ZA")}` : ""}`, inline: false });

    if (b.device) fields.push({ name: "Device", value: deviceLabel(b.device), inline: true });

    // Geo from the caller IP (meaningful for browser-originated events).
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    if (b.device && ip) {
      const geo = await geoFor(ip);
      if (geo) { fields.push({ name: "Location", value: geo.label, inline: true }); fields.push({ name: "IP", value: `\`${geo.ip}\``, inline: true }); }
    }

    // Deep links: PostHog replay + open the lead + dashboard.
    const links: string[] = [];
    if (b.sessionId) {
      const projectId = await secret("POSTHOG_PROJECT_ID");
      const host = (await secret("POSTHOG_HOST")) || "https://us.posthog.com";
      const replay = projectId
        ? `${host}/project/${projectId}/replay/${b.sessionId}`
        : `${host}/replay/${b.sessionId}`;
      links.push(`[▶ Session replay](${replay})`);
    } else if (b.distinctId) {
      const projectId = await secret("POSTHOG_PROJECT_ID");
      const host = (await secret("POSTHOG_HOST")) || "https://us.posthog.com";
      if (projectId) links.push(`[👤 Person in PostHog](${host}/project/${projectId}/person/${b.distinctId})`);
    }
    if (lead.id && b.agentId) {
      const link = await leadShareLink(String(lead.id), String(b.agentId));
      if (link) links.push(`[📇 Open lead](${link})`);
    }
    links.push(`[📊 Dashboard](${APP}/leads)`);

    const descLines = [`-# ${cfg.cat} · <t:${now}:R>`];
    if (links.length) descLines.push(links.join("  ·  "));

    const embed: Record<string, unknown> = {
      author: { name: company ? `${agentName} · ${company}` : agentName, icon_url: logo || EK_LOGO },
      title: `${cfg.emoji}  ${cfg.label}`,
      description: descLines.join("\n"),
      color: cfg.color,
      fields,
      thumbnail: { url: logo || EK_LOGO },
      footer: { text: `EstateKit Activity · ${agentName}`, icon_url: EK_LOGO },
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "EstateKit Activity", avatar_url: EK_LOGO, embeds: [embed] }),
    });
    if (!res.ok) return json({ error: `discord ${res.status}` }, 502);
    return json({ ok: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
