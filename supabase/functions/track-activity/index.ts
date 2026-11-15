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
// A PNG: Discord can't show an SVG.
const EK_LOGO = "https://leads.estatekit.co/icon-192.png";

type EventKey =
  | "login" | "checkin_answered" | "new_lead" | "form_submitted" | "lead_disqualified" | "stage_change"
  | "call_started" | "note_added" | "lead_page_created" | "lead_page_deleted" | "sold_listing_added"
  | "page_view" | "form_started" | "form_contact_step" | "ad_paused" | "ad_resumed"
  // Confirmation email + selling plan (sent by the database as they happen)
  | "email_sent" | "email_failed" | "email_bounced" | "email_complained" | "email_opened" | "email_whatsapp_tap" | "plan_opened"
  // Setup changes made in the app
  | "form_type_changed" | "email_switched" | "email_wording_changed" | "client_details_edited"
  | "whatsapp_number_changed" | "page_link_changed"
  // Access and automation switches (audit log)
  | "logout" | "account_switched" | "password_reset" | "automation_toggled" | "automations_stopped";

const EVENTS: Record<EventKey, { emoji: string; label: string; color: number; cat: string }> = {
  login:              { emoji: "🔓", label: "Signed in",            color: 0x6366f1, cat: "Agent" },
  new_lead:           { emoji: "📥", label: "New lead",             color: 0x22c55e, cat: "Lead" },
  checkin_answered:   { emoji: "💬", label: "Weekly check-in answered", color: 0x6366f1, cat: "Client" },
  form_submitted:     { emoji: "📥", label: "New lead",             color: 0x22c55e, cat: "Lead" },
  lead_disqualified:  { emoji: "🚫", label: "Lead disqualified",    color: 0x9ca3af, cat: "Lead" },
  stage_change:       { emoji: "🔀", label: "Lead stage changed",   color: 0x3b82f6, cat: "Lead" },
  call_started:       { emoji: "📞", label: "Called a lead",        color: 0x14b8a6, cat: "Agent" },
  note_added:         { emoji: "📝", label: "Added a note",         color: 0x64748b, cat: "Agent" },
  lead_page_created:  { emoji: "✨", label: "Created a lead page",   color: 0x8b5cf6, cat: "Page" },
  lead_page_deleted:  { emoji: "🗑️", label: "Deleted a lead page",  color: 0x8b5cf6, cat: "Page" },
  sold_listing_added: { emoji: "🏡", label: "Added a recent sale",  color: 0xf59e0b, cat: "Page" },
  page_view:          { emoji: "👀", label: "Landing page viewed",   color: 0x94a3b8, cat: "Funnel" },
  form_started:       { emoji: "▶️", label: "Started the form",      color: 0x0ea5e9, cat: "Funnel" },
  form_contact_step:  { emoji: "✍️", label: "Reached contact details", color: 0xf59e0b, cat: "Funnel" },
  ad_paused:          { emoji: "⏸️", label: "Ad paused",             color: 0xd93025, cat: "Ads" },
  ad_resumed:         { emoji: "▶️", label: "Ad resumed",            color: 0x1e8e3e, cat: "Ads" },
  email_sent:         { emoji: "📧", label: "Confirmation email sent", color: 0x1a73e8, cat: "Email" },
  email_failed:       { emoji: "⚠️", label: "Confirmation email didn't send", color: 0xd93025, cat: "Email" },
  email_bounced:      { emoji: "↩️", label: "Confirmation email bounced", color: 0xd93025, cat: "Email" },
  email_complained:   { emoji: "🚩", label: "Confirmation email marked as spam", color: 0xd93025, cat: "Email" },
  email_opened:       { emoji: "👀", label: "Lead opened the email", color: 0x1a73e8, cat: "Email" },
  email_whatsapp_tap: { emoji: "💬", label: "Lead tapped WhatsApp", color: 0x25d366, cat: "Email" },
  plan_opened:        { emoji: "📄", label: "Lead opened their selling plan", color: 0x137a3a, cat: "Email" },
  form_type_changed:  { emoji: "🧩", label: "Form type changed",     color: 0x8b5cf6, cat: "Setup" },
  email_switched:     { emoji: "🔔", label: "Confirmation email switched", color: 0x8b5cf6, cat: "Setup" },
  email_wording_changed: { emoji: "✏️", label: "Email wording changed", color: 0x8b5cf6, cat: "Setup" },
  client_details_edited: { emoji: "🗂️", label: "Client details edited", color: 0x8b5cf6, cat: "Setup" },
  whatsapp_number_changed: { emoji: "📱", label: "WhatsApp number changed", color: 0xf59e0b, cat: "Setup" },
  page_link_changed:  { emoji: "🔗", label: "Page link changed",     color: 0xf59e0b, cat: "Setup" },
  logout:             { emoji: "🔒", label: "Signed out",            color: 0x6366f1, cat: "Agent" },
  account_switched:   { emoji: "🔁", label: "Switched account",      color: 0x6366f1, cat: "Access" },
  password_reset:     { emoji: "🔑", label: "Password reset",        color: 0xd93025, cat: "Access" },
  automation_toggled: { emoji: "⚡", label: "Automation switched",   color: 0xf59e0b, cat: "Automations" },
  automations_stopped:{ emoji: "🛑", label: "All automations stopped", color: 0xd93025, cat: "Automations" },
};

// What goes in the audit_log table (operators read it on Account → Audit log).
// Lead and email events are left out: lead_events already records those.
const AUDIT_CATEGORY: Partial<Record<EventKey, string>> = {
  login: "login", logout: "login",
  form_type_changed: "setup", email_switched: "setup", email_wording_changed: "setup", client_details_edited: "setup",
  whatsapp_number_changed: "setup", page_link_changed: "setup",
  lead_page_created: "setup", lead_page_deleted: "setup", sold_listing_added: "setup",
  ad_paused: "ads", ad_resumed: "ads",
  automation_toggled: "automations", automations_stopped: "automations",
  account_switched: "account", password_reset: "account",
};

// Discord only hears the moments that matter: a new lead, a lead moving on,
// a client's check-in. Everything else is still in the audit log.
const TO_DISCORD = new Set<string>(["new_lead", "form_submitted", "stage_change", "checkin_answered"]);

// The card for each moment: its banner (/api/og?t=…), colour and emoji.
type Kind = "new_lead" | "contacted" | "booked" | "viewing" | "offer" | "mandate" | "bought" | "lost" | "not_owner" | "invalid" | "checkin";
const CARD: Record<Kind, { title: string; emoji: string; color: number }> = {
  new_lead: { title: "New lead", emoji: "📥", color: 0x10b981 },
  contacted: { title: "Spoke · following up", emoji: "💬", color: 0x2563eb },
  booked: { title: "Appointment booked", emoji: "📅", color: 0x7c3aed },
  viewing: { title: "Viewing booked", emoji: "👀", color: 0x7c3aed },
  offer: { title: "Offer made", emoji: "💰", color: 0x0d9488 },
  mandate: { title: "Mandate signed", emoji: "🏆", color: 0xf59e0b },
  bought: { title: "Bought", emoji: "🔑", color: 0xf59e0b },
  lost: { title: "Not selling", emoji: "🚫", color: 0x64748b },
  not_owner: { title: "Not the owner", emoji: "🙅", color: 0x64748b },
  invalid: { title: "Wrong number", emoji: "📵", color: 0x64748b },
  checkin: { title: "Check-in answered", emoji: "⭐", color: 0xdb2777 },
};
const STAGE_KIND: Record<string, Kind> = {
  Contacted: "contacted", Booked: "booked", "Viewing Booked": "viewing", "Offer Made": "offer",
  "Mandate Signed": "mandate", Bought: "bought", Lost: "lost", "Invalid Number": "invalid",
};
// A recruitment ("general") pipeline uses the seller stages with its own words.
const GENERAL_TITLE: Partial<Record<Kind, string>> = { booked: "Meeting booked", mandate: "Signed up", lost: "Not interested" };

/** Which card a stage change gets, or null for one not worth a post
 *  ("No answer" happens on most calls; back to "New lead" is a correction). */
function stageKind(toStage: string): Kind | null {
  const [stage, reason] = toStage.split(" · ");
  if (stage === "Lost" && reason === "Not the owner") return "not_owner";
  return STAGE_KIND[stage] ?? null;
}

/** Their answer to the address question, if the form asked. */
function addressOf(answers: unknown): string {
  const a = (Array.isArray(answers) ? answers : []).find((x) => /address|where/i.test(String(x?.q ?? "")));
  return a?.a ? String(a.a).trim() : "";
}

/** "Tue 17 Nov, 10:00", South African time. */
function sast(iso: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function secret(name: string): Promise<string> {
  const { data } = await supabase.rpc("get_secret", { secret_name: name });
  return data || "";
}

function flagOf(cc?: string): string {
  if (!cc || cc.length !== 2) return "";
  return String.fromCodePoint(...cc.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
}

async function geoFor(ip: string): Promise<{ label: string; ip: string; country: string; location: string } | null> {
  if (!ip) return null;
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(2500) });
    const d = await r.json();
    if (d && !d.error) {
      const location = [d.city, d.region, d.country_name].filter(Boolean).join(", ");
      const label = `${flagOf(d.country_code)} ${location}`.trim();
      return { label: label || "—", ip, country: String(d.country_code || "").toUpperCase(), location };
    }
  } catch { /* ignore */ }
  return { label: "—", ip, country: "", location: "" };
}

/** The signed-in user who sent this, from their own token. Never trusted from the body. */
async function verifiedActor(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const { data } = await supabase.auth.getUser(token);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** 12 letters/digits with no look-alikes (no 0/o, 1/l): 60 random bits.
 *  Short enough to read in a WhatsApp message, far too many to guess, and
 *  the link expires.
 *  Old 8/32-char links keep working. */
function shortToken(): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

/** The same kind of link an agent gets on WhatsApp (/l/{token}, no sign-in
 *  needed) — not the internal /leads/{id} dashboard route, which only works
 *  if you're already signed in as that specific agent. */
async function leadShareLink(leadId: string, agentId: string): Promise<string | null> {
  const token = shortToken();
  const { error } = await supabase.from("lead_share_tokens").insert({
    lead_id: leadId,
    agent_id: agentId,
    token,
    link_type: "first_touch",
    // 90 days: agents open last week's alerts too (20261029_0006).
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) {
    console.error("leadShareLink: token insert failed", error.message);
    return null;
  }
  return `${APP}/l/${token}`;
}

/** A problem that stops leads or messages getting through. Only our own
 *  functions may raise one (they send the service key), so nobody outside can
 *  post fake alerts. Every sighting is noted; Discord hears about it once it's
 *  happened minTimes within withinMinutes, then not again for quietHours. */
async function attention(req: Request, b: Record<string, unknown>): Promise<Response> {
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!auth || auth !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return json({ error: "forbidden" }, 403);
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const key = text(b.key, 160);
  const title = text(b.title, 120);
  if (!key || !title) return json({ error: "key and title required" }, 400);
  const detail = text(b.detail, 600);
  const fix = text(b.fix, 400);
  const agentId = typeof b.agentId === "string" && UUID.test(b.agentId) ? b.agentId : null;
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const minTimes = num(b.minTimes, 1, 1, 50);
  const withinMinutes = num(b.withinMinutes, 60, 1, 1440);
  const quietHours = num(b.quietHours, 12, 1, 168);

  await supabase.from("audit_log").insert({ event: "attention_seen", category: "health", account_id: agentId, detail: title, data: { key } });
  if (minTimes > 1) {
    const { count } = await supabase.from("audit_log").select("id", { count: "exact", head: true })
      .eq("event", "attention_seen").eq("data->>key", key).gte("created_at", new Date(Date.now() - withinMinutes * 60_000).toISOString());
    if ((count ?? 0) < minTimes) return json({ ok: true, held: "not yet" });
  }
  const { count: recent } = await supabase.from("audit_log").select("id", { count: "exact", head: true })
    .eq("event", "attention_sent").eq("data->>key", key).gte("created_at", new Date(Date.now() - quietHours * 3600_000).toISOString());
  if ((recent ?? 0) > 0) return json({ ok: true, held: "already said" });
  await supabase.from("audit_log").insert({ event: "attention_sent", category: "health", account_id: agentId, detail: [title, detail].filter(Boolean).join(" · ").slice(0, 1000), data: { key, fix } });

  const webhook = await secret("DISCORD_ACTIVITY_WEBHOOK");
  if (!webhook) return json({ ok: true, skipped: "no webhook configured" });
  let who = "EstateKit";
  if (agentId) {
    const { data: prof } = await supabase.from("agent_profiles").select("display_name, company").eq("agent_id", agentId).maybeSingle();
    if (prof?.display_name) who = prof.company ? `${prof.display_name} · ${prof.company}` : prof.display_name;
  }
  const fields = [
    ...(detail ? [{ name: "What's wrong", value: detail, inline: false }] : []),
    ...(fix ? [{ name: "What to do", value: fix, inline: false }] : []),
  ];
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "EstateKit Activity",
      avatar_url: EK_LOGO,
      embeds: [{
        author: { name: who, icon_url: EK_LOGO },
        title: `🚨  Needs attention: ${title}`,
        description: `-# Health · <t:${Math.floor(Date.now() / 1000)}:R> · we'll stay quiet about this for ${quietHours}h`,
        color: 0xd93025,
        fields,
        footer: { text: "EstateKit Health", icon_url: EK_LOGO },
        timestamp: new Date().toISOString(),
      }],
    }),
  });
  return res.ok ? json({ ok: true }) : json({ error: `discord ${res.status}` }, 502);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const b = await req.json();
    if (b?.event === "attention") return await attention(req, b);
    const cfg = EVENTS[b.event as EventKey];
    if (!cfg) return json({ error: "unknown event" }, 400);

    // Caller location, once (meaningful for browser-originated events).
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const geo = b.device && ip ? await geoFor(ip) : null;

    // ── Audit log ───────────────────────────────────────────────────────
    const auditCategory = AUDIT_CATEGORY[b.event as EventKey];
    if (auditCategory) {
      const actorId = await verifiedActor(req);
      let actorName: string | null = null;
      if (actorId) {
        const { data: me } = await supabase.from("agent_profiles").select("display_name").eq("agent_id", actorId).maybeSingle();
        actorName = me?.display_name ?? null;
      }
      const accountId = typeof b.agentId === "string" && UUID.test(b.agentId) ? b.agentId : actorId;
      const detail = [b.detail, b.ad?.name && `Ad: ${b.ad.name}`, b.page?.name && `Page: ${b.page.name}`, b.sale?.address && `Sale: ${b.sale.address}`]
        .filter(Boolean).join(" · ").slice(0, 1000) || null;
      const { error } = await supabase.from("audit_log").insert({
        event: b.event,
        category: auditCategory,
        actor_id: actorId,
        actor_name: actorName,
        account_id: accountId,
        detail,
        data: { page: b.page ?? null, ad: b.ad ?? null, sale: b.sale ?? null },
        ip: ip || null,
        country: geo?.country || null,
        location: geo?.location || null,
        device: typeof b.device === "string" ? b.device.slice(0, 300) : null,
        session_id: typeof b.sessionId === "string" ? b.sessionId.slice(0, 100) : null,
      });
      if (error) console.error("audit_log insert failed", error.message);
    }
    if (!TO_DISCORD.has(b.event)) return json({ ok: true, quiet: true });

    // ── Discord: one card per moment, with its banner ──────────────────────
    const lead = b.lead || {};
    let kind: Kind;
    if (b.event === "checkin_answered") kind = "checkin";
    else if (b.event === "stage_change") {
      const k = stageKind(String(lead.toStage ?? ""));
      if (!k) return json({ ok: true, quiet: true });
      kind = k;
    } else kind = "new_lead";

    const webhook = await secret("DISCORD_ACTIVITY_WEBHOOK");
    if (!webhook) return json({ ok: true, skipped: "no webhook configured" });

    // Whose account it is.
    let agentName = b.actorName || "Someone";
    let company = "";
    let logo = "";
    let photo = "";
    if (b.agentId) {
      const { data: prof } = await supabase
        .from("agent_profiles")
        .select("display_name, company, sidebar_logo_url, avatar_url")
        .eq("agent_id", b.agentId)
        .maybeSingle();
      if (prof) {
        agentName = prof.display_name || agentName;
        company = prof.company || "";
        // Discord shows PNG, JPEG and WebP, not SVG.
        const shown = (u: unknown) => (typeof u === "string" && u.startsWith("https://") && !/\.svg(\?|$)/i.test(u) ? u : "");
        logo = shown(prof.sidebar_logo_url);
        photo = shown(prof.avatar_url);
      }
    }

    // The lead as it is now: where they live and any appointment.
    let address = String(lead.address ?? "");
    let appointment = "";
    if (lead.id && UUID.test(String(lead.id))) {
      const { data: row } = await supabase.from("leads").select("form_answers, appointment_at").eq("id", lead.id).maybeSingle();
      if (row) {
        address ||= addressOf(row.form_answers);
        if (row.appointment_at && (kind === "booked" || kind === "viewing")) appointment = sast(row.appointment_at);
      }
    }

    const card = CARD[kind];
    const title = (lead.pipeline === "general" && GENERAL_TITLE[kind]) || card.title;
    const who = kind === "checkin" ? agentName : String(lead.name || "A lead");
    const avg = /average ([\d.]+) of 5/i.exec(String(b.detail ?? ""));
    const was = String(lead.fromStage ?? "").split(" · ")[0];
    const line = kind === "checkin"
      ? `${/^At risk/i.test(String(b.detail ?? "")) ? "At risk · " : ""}${avg ? `Average ${avg[1]} of 5` : "New answers"}`
      : appointment || address || (was ? `Was ${was === "New Lead" ? "a new lead" : was.toLowerCase()}` : "");

    const banner = new URL(`${APP}/api/og`);
    for (const [k, v] of Object.entries({ t: kind, n: who, s: line, a: kind === "checkin" ? "" : agentName, c: company, l: title !== card.title ? title : "", v: "2" })) {
      if (v) banner.searchParams.set(k, v.slice(0, 60));
    }

    // A few plain lines under the banner, then the links.
    const lines: string[] = [];
    if (kind === "new_lead") {
      if (address) lines.push(`📍 ${address}`);
      if (lead.phone) lines.push(`📞 ${lead.phone}`);
      const from = [lead.source, b.page?.name].filter(Boolean).join(" · ");
      if (from) lines.push(`📣 ${from}`);
    } else if (kind === "checkin") {
      if (b.detail) lines.push(String(b.detail).slice(0, 600));
    } else {
      if (was) lines.push(`${was}  →  **${title}**`);
      if (appointment) lines.push(`🗓️ ${appointment}`);
    }
    const links: string[] = [];
    let leadLink: string | null = null;
    if (lead.id && b.agentId) {
      leadLink = await leadShareLink(String(lead.id), String(b.agentId));
      if (leadLink) links.push(`[📇 Open lead](${leadLink})`);
    }
    if (b.sessionId && kind === "new_lead") {
      const projectId = await secret("POSTHOG_PROJECT_ID");
      const host = (await secret("POSTHOG_HOST")) || "https://us.posthog.com";
      links.push(`[▶ Watch them fill it in](${projectId ? `${host}/project/${projectId}/replay/${b.sessionId}` : `${host}/replay/${b.sessionId}`})`);
    }
    if (links.length) lines.push(links.join("  ·  "));

    const embed: Record<string, unknown> = {
      // Their own face by their name, their company logo in the corner.
      author: { name: company ? `${agentName} · ${company}` : agentName, icon_url: photo || logo || EK_LOGO },
      ...(logo ? { thumbnail: { url: logo } } : {}),
      title: `${card.emoji}  ${title} · ${who}`.slice(0, 250),
      ...(leadLink ? { url: leadLink } : {}),
      description: lines.join("\n").slice(0, 3800) || undefined,
      color: card.color,
      image: { url: banner.toString() },
      footer: { text: "EstateKit", icon_url: EK_LOGO },
      timestamp: new Date().toISOString(),
    };
    const win = kind === "mandate" || kind === "bought";

    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "EstateKit",
        avatar_url: EK_LOGO,
        ...(win ? { content: `🎉 **${title}!** ${who} with ${agentName}` } : {}),
        embeds: [embed],
      }),
    });
    if (!res.ok) return json({ error: `discord ${res.status}` }, 502);
    return json({ ok: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
