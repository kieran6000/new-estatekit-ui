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
  | "call_time_set"
  | "logout" | "account_switched" | "password_reset" | "automation_toggled" | "automations_stopped";

const EVENTS: Record<EventKey, { emoji: string; label: string; color: number; cat: string }> = {
  login:              { emoji: "🔓", label: "Signed in",            color: 0x6366f1, cat: "Agent" },
  new_lead:           { emoji: "📥", label: "New lead",             color: 0x22c55e, cat: "Lead" },
  checkin_answered:   { emoji: "💬", label: "Weekly check-in answered", color: 0x6366f1, cat: "Client" },
  form_submitted:     { emoji: "📥", label: "New lead",             color: 0x22c55e, cat: "Lead" },
  lead_disqualified:  { emoji: "🚫", label: "Lead disqualified",    color: 0x9ca3af, cat: "Lead" },
  call_time_set:      { emoji: "🕒", label: "Picked a time to call", color: 0x0e7490, cat: "Lead" },
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

// Discord only hears the moments that matter: a new lead, a picked call
// time, a lead moving on, a client's check-in. Everything else is still in
// the audit log.
const TO_DISCORD = new Set<string>(["new_lead", "form_submitted", "call_time_set", "stage_change", "checkin_answered"]);

// The card for each moment: its banner (/api/og?t=…), colour and emoji, and
// the word for it at the end of the lead's history line.
type Kind = "new_lead" | "call_time" | "contacted" | "booked" | "viewing" | "offer" | "mandate" | "bought" | "lost" | "not_owner" | "invalid" | "checkin" | "showed" | "proposal" | "paid" | "churned";
const CARD: Record<Kind, { title: string; emoji: string; color: number; step: string }> = {
  new_lead: { title: "New lead", emoji: "📥", color: 0x059669, step: "New lead" },
  call_time: { title: "Picked a time to call", emoji: "🕒", color: 0x0e7490, step: "Picked a time" },
  contacted: { title: "Spoke · following up", emoji: "💬", color: 0x2563eb, step: "Spoke" },
  booked: { title: "Appointment booked", emoji: "📅", color: 0x6d28d9, step: "Booked" },
  viewing: { title: "Viewing booked", emoji: "👀", color: 0x6d28d9, step: "Viewing booked" },
  offer: { title: "Offer made", emoji: "💰", color: 0x0d9488, step: "Offer" },
  mandate: { title: "Mandate signed", emoji: "🏆", color: 0xd97706, step: "Mandate signed" },
  bought: { title: "Bought", emoji: "🔑", color: 0xd97706, step: "Bought" },
  lost: { title: "Not selling", emoji: "🚫", color: 0x475569, step: "Not selling" },
  not_owner: { title: "Not the owner", emoji: "🙅", color: 0x475569, step: "Not the owner" },
  invalid: { title: "Wrong number", emoji: "📵", color: 0x475569, step: "Wrong number" },
  checkin: { title: "Check-in answered", emoji: "⭐", color: 0xdb2777, step: "" },
  showed: { title: "Showed up", emoji: "👋", color: 0x2563eb, step: "Showed" },
  proposal: { title: "Proposal sent", emoji: "📄", color: 0x0d9488, step: "Proposal" },
  paid: { title: "Paid", emoji: "💳", color: 0xd97706, step: "Paid" },
  churned: { title: "Churned", emoji: "🚫", color: 0x475569, step: "Churned" },
};
const STAGE_KIND: Record<string, Kind> = {
  Contacted: "contacted", Booked: "booked", "Viewing Booked": "viewing", "Offer Made": "offer",
  "Mandate Signed": "mandate", Bought: "bought", Lost: "lost", "Invalid Number": "invalid",
  "Call booked": "booked", Showed: "showed", "No-show": "lost",
  "Proposal sent": "proposal", Signed: "mandate", Paid: "paid",
  Churned: "churned",
};
// A recruitment ("general") pipeline uses the seller stages with its own words.
const GENERAL_TITLE: Partial<Record<Kind, string>> = { booked: "Meeting booked", mandate: "Signed up", lost: "Not interested" };
const AGENCY_TITLE: Partial<Record<Kind, string>> = { booked: "Call booked", mandate: "Signed", lost: "Lost" };

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

/** The parts of a time in South Africa: weekday, day, month, 24-hour time. */
function sastParts(iso: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return { day: p.weekday, date: p.day, month: p.month, time: `${p.hour}:${p.minute}` };
}
/** "Tue 17 Nov, 10:00" */
const sast = (iso: string) => { const p = sastParts(iso); return `${p.day} ${p.date} ${p.month}, ${p.time}`; };
/** "Tue|17|Nov|10:00", for the banner's calendar. */
const sastCal = (iso: string) => { const p = sastParts(iso); return [p.day, p.date, p.month, p.time].join("|"); };

/** "just now", "5m ago", "3h ago", "4d ago", "3w ago". */
function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  if (m < 14 * 1440) return `${Math.round(m / 1440)}d ago`;
  return `${Math.round(m / 10080)}w ago`;
}

/** The lead's story so far, in four steps at most: when they came in, a
 *  picked time, how many calls, a booking on the way, and this moment. */
async function historyOf(leadId: string, createdAt: string, now: string): Promise<string[]> {
  const { data } = await supabase.from("lead_events").select("event_type, to_value").eq("lead_id", leadId)
    .in("event_type", ["call", "stage_changed", "call_time_set"]).limit(500);
  const ev = data ?? [];
  const calls = ev.filter((e) => e.event_type === "call").length;
  const steps = [`Came in ${ago(createdAt)}`];
  if (now !== "Picked a time" && ev.some((e) => e.event_type === "call_time_set")) steps.push("Picked a time");
  if (calls) steps.push(`Called ${calls}×`);
  if (!/Booked|booked/.test(now) && ev.some((e) => e.event_type === "stage_changed" && /Booked/.test(String(e.to_value ?? "")))) steps.push("Booked");
  if (now) steps.push(now);
  return steps.length > 4 ? [steps[0], ...steps.slice(-3)] : steps;
}

/** Where the lead came from, in a word. */
function sourceOf(row: { fb_lead_id?: string | null; attribution?: Record<string, string> | null } | null): string {
  if (row?.fb_lead_id) return "Facebook instant form";
  const a = row?.attribution ?? {};
  if (a.fbclid || /^(fb|facebook|ig|instagram)$/i.test(a.utm_source ?? "") || /facebook|instagram/i.test(a.referrer ?? "")) return "Facebook ad";
  if (/google/i.test(`${a.utm_source ?? ""} ${a.referrer ?? ""}`) || a.gclid) return "Google";
  return "Website";
}

/** Is the address in the suburbs the agent works? From their Brief (top
 *  suburbs) and their town. Words, not a map: no distances without a
 *  geocoding key on the server. */
async function areaNote(agentId: string, address: string, town: string): Promise<string> {
  if (!address) return "";
  const { data: d } = await supabase.from("client_dossiers").select("data").eq("agent_id", agentId).maybeSingle();
  const data = (d?.data ?? {}) as { onboarding?: { q?: string; a?: string }[]; oldDashboard?: { targetAreas?: string[] } };
  const answer = (q: string) => (Array.isArray(data.onboarding) ? data.onboarding : []).find((x) => x?.q === q && x?.a?.trim())?.a ?? "";
  const list = answer("Top suburbs") || answer("Top areas to target") || (data.oldDashboard?.targetAreas ?? []).join(",");
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const where = squash(address);
  const suburbs = String(list).split(/[;,\n]/).map((s) => s.trim()).filter((s) => squash(s).length > 3);
  const hit = suburbs.find((s) => where.includes(squash(s)));
  if (hit) return `In their area: ${hit}`;
  const city = town.split(/[,/•|]/)[0].trim();
  if (city && squash(city).length > 3 && where.includes(squash(city))) return suburbs.length ? `In ${city}, but not one of their suburbs` : `In their town: ${city}`;
  // Their suburbs known and none named: say so. Nothing known: say nothing, rather than guess.
  return suburbs.length ? `Not one of their suburbs (${suburbs.slice(0, 3).join(", ")}${suburbs.length > 3 ? "…" : ""})` : "";
}

/** The ad a Facebook lead came from (fb-lead-source-ad works it out). */
async function adOf(leadId: string): Promise<{ image: string; name: string } | null> {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/fb-lead-source-ad`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ leadId }),
      signal: AbortSignal.timeout(5000),
    });
    const d = await r.json();
    return d?.ad ? { image: String(d.ad.imageUrl ?? ""), name: String(d.ad.name ?? "") } : null;
  } catch {
    return null;
  }
}

/** A picked call time comes from the lead's own page, so it says which lead
 *  only by its private code (or the form and their number). The lead must
 *  really have just picked a time, so nobody can post one for them. */
async function leadForCallTime(b: Record<string, unknown>) {
  let leadId: string | null = null;
  if (typeof b.planToken === "string" && b.planToken.length >= 8) {
    const { data } = await supabase.from("lead_plan_tokens").select("lead_id").eq("token", b.planToken).maybeSingle();
    leadId = data?.lead_id ?? null;
  } else if (typeof b.slug === "string" && typeof b.phone === "string") {
    const digits = b.phone.replace(/\D/g, "").slice(-9);
    const { data: page } = await supabase.from("lead_pages").select("id").eq("slug", b.slug).maybeSingle();
    if (page && digits.length === 9) {
      const { data } = await supabase.from("leads").select("id, phone").eq("source_page_id", page.id).order("created_at", { ascending: false }).limit(50);
      leadId = (data ?? []).find((l) => String(l.phone ?? "").replace(/\D/g, "").endsWith(digits))?.id ?? null;
    }
  }
  if (!leadId) return null;
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await supabase.from("lead_events").select("id", { count: "exact", head: true })
    .eq("lead_id", leadId).eq("event_type", "call_time_set").gte("created_at", since);
  if (!count) return null;
  const { data: lead } = await supabase.from("leads").select("id, name, phone, agent_id").eq("id", leadId).maybeSingle();
  return lead;
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
    if (b.event === "call_time_set") {
      const found = await leadForCallTime(b);
      if (!found) return json({ ok: true, quiet: true });
      b.agentId = found.agent_id;
      b.lead = { id: found.id, name: found.name, phone: found.phone };
    }
    const lead = b.lead || {};
    let kind: Kind;
    if (b.event === "checkin_answered") kind = "checkin";
    else if (b.event === "call_time_set") kind = "call_time";
    else if (b.event === "stage_change") {
      const k = stageKind(String(lead.toStage ?? ""));
      if (!k) return json({ ok: true, quiet: true });
      kind = k;
    } else kind = "new_lead";

    const webhook = await secret("DISCORD_ACTIVITY_WEBHOOK");
    if (!webhook) return json({ ok: true, skipped: "no webhook configured" });

    // A stage change logged without the account says whose it is through the lead.
    if (!b.agentId && lead.id && UUID.test(String(lead.id))) {
      const { data: owner } = await supabase.from("leads").select("agent_id").eq("id", lead.id).maybeSingle();
      if (owner?.agent_id) b.agentId = owner.agent_id;
    }

    // Whose account it is.
    let agentName = b.actorName || "Someone";
    let company = "";
    let logo = "";
    let photo = "";
    let photoRaw = "";
    let town = "";
    if (b.agentId) {
      const { data: prof } = await supabase
        .from("agent_profiles")
        .select("display_name, company, sidebar_logo_url, avatar_url, area")
        .eq("agent_id", b.agentId)
        .maybeSingle();
      if (prof) {
        agentName = prof.display_name || agentName;
        company = prof.company || "";
        town = prof.area || "";
        // Discord shows PNG, JPEG and WebP, not SVG. The banner converts its own.
        const shown = (u: unknown) => (typeof u === "string" && u.startsWith("https://") && !/\.svg(\?|$)/i.test(u) ? u : "");
        logo = shown(prof.sidebar_logo_url);
        photo = shown(prof.avatar_url);
        photoRaw = typeof prof.avatar_url === "string" ? prof.avatar_url : "";
      }
    }

    // The lead as it is now.
    const leadId = lead.id && UUID.test(String(lead.id)) ? String(lead.id) : "";
    const { data: row } = leadId
      ? await supabase.from("leads").select("created_at, phone, form_answers, appointment_at, call_at, fb_lead_id, attribution, source_page_id").eq("id", leadId).maybeSingle()
      : { data: null };
    const address = String(lead.address ?? "") || addressOf(row?.form_answers);
    const phone = String(lead.phone ?? row?.phone ?? "");

    const card = CARD[kind];
    const titleOverride = lead.pipeline === "general" ? GENERAL_TITLE[kind] : lead.pipeline === "agency" ? AGENCY_TITLE[kind] : undefined;
    const title = titleOverride || card.title;
    const who = kind === "checkin" ? agentName : String(lead.name || "A lead").trim();
    const was = String(lead.fromStage ?? "").split(" · ")[0];
    const at = (kind === "booked" || kind === "viewing") ? row?.appointment_at : kind === "call_time" ? row?.call_at : null;
    const avg = /average ([\d.]+) of 5/i.exec(String(b.detail ?? ""));

    // Where they came from: the form (with its link) and the ad.
    const source = sourceOf(row);
    let page: { name: string; slug: string; source_type: string } | null = null;
    if (row?.source_page_id) {
      const { data: p } = await supabase.from("lead_pages").select("name, slug, source_type").eq("id", row.source_page_id).maybeSingle();
      page = p ?? null;
    }
    const ad = kind === "new_lead" && leadId && source.startsWith("Facebook") ? await adOf(leadId) : null;
    const stepOverride = lead.pipeline === "general" ? GENERAL_TITLE[kind] : lead.pipeline === "agency" ? AGENCY_TITLE[kind] : undefined;
    const history = row && leadId && kind !== "new_lead" && kind !== "checkin" ? await historyOf(leadId, row.created_at, stepOverride || card.step) : [];
    const area = kind === "new_lead" && b.agentId ? await areaNote(String(b.agentId), address, town) : "";

    const banner = new URL(`${APP}/api/og`);
    const line = kind === "checkin"
      ? `${/^At risk/i.test(String(b.detail ?? "")) ? "At risk · " : ""}${avg ? `Average ${avg[1]} of 5` : "New answers"}`
      : address;
    for (const [k, v] of Object.entries({
      t: kind, n: who, s: line, a: agentName, ph: photoRaw, ad: ad?.image ?? "", src: source === "Facebook instant form" ? "Instant form" : source,
      w: at ? sastCal(at) : "", h: history.join("|"), sc: avg?.[1] ?? "", l: title !== card.title ? title : "", v: "4",
    })) {
      if (v) banner.searchParams.set(k, k === "ph" || k === "ad" ? v : v.slice(0, 80));
    }

    // A few plain lines under the title, then the links.
    const lines: string[] = [];
    if (kind === "new_lead") {
      // The area in Discord's small grey text, under the address.
      if (address) lines.push(`📍 ${address}${area ? `\n-# ${area}` : ""}`);
      if (row?.call_at) lines.push(`🕒 Wants a call ${sast(row.call_at)}`);
      if (phone) lines.push(`📞 ${phone}`);
      // A web form links to itself; an instant form to the lead with their form open.
      const form = page ? (page.source_type === "website" && page.slug ? `[${page.name}](${APP}/p/${page.slug})` : leadId ? `[${page.name}](${APP}/leads/${leadId}?form=1)` : page.name) : "";
      const from = [form, source, ad?.name ? `“${ad.name}”` : ""].filter(Boolean).join(" · ");
      if (from) lines.push(`📣 ${from}`);
    } else if (kind === "checkin") {
      if (b.detail) lines.push(String(b.detail).slice(0, 600));
    } else {
      if (was && kind !== "call_time") lines.push(`${was}  →  **${title}**`);
      if (at) lines.push(`🗓️ ${sast(at)}`);
      if (phone && (kind === "call_time" || kind === "booked" || kind === "viewing")) lines.push(`📞 ${phone}`);
    }
    const links: string[] = [];
    let leadLink: string | null = null;
    if (leadId && b.agentId) {
      leadLink = await leadShareLink(leadId, String(b.agentId));
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
      title: (kind === "new_lead" ? `${card.emoji}  ${who}` : `${card.emoji}  ${title} · ${who}`).slice(0, 250),
      ...(leadLink ? { url: leadLink } : {}),
      description: lines.join("\n").slice(0, 3800) || undefined,
      color: card.color,
      image: { url: banner.toString() },
      footer: { text: "EstateKit", icon_url: EK_LOGO },
      timestamp: new Date().toISOString(),
    };
    const win = kind === "mandate" || kind === "bought" || kind === "paid";

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
