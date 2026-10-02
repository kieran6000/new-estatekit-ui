import { supabase } from "./_client";

// Real data for the operator audit log. Everything here is already recorded:
//   lead_events            who did what to which lead, when, from which device
//                          (calls, stage changes, notes, archives, automation
//                          WhatsApps and emails, lead arrivals, plan opens)
//   operator_last_activity each user's last sign-in and last action
//   agent_profiles         every user's details
//   audit_log              sign-ins and sign-outs, setup changes, ad pauses,
//                          automation switches, password resets, account
//                          switching, with IP, country and location. Written
//                          by track-activity from the caller's verified sign-in.

export type AuditCategory = "login" | "leads" | "automations" | "setup" | "ads" | "account";

export interface AuditUser {
  id: string;
  name: string;
  role: "Operator" | "Agent";
  phone: string;
  email: string;
  company: string;
  area: string;
  plan: string;
  status: "Active" | "Automations paused" | "Deactivated";
  renewalDate: string | null;
  lastSeen: string | null;
  lastSignIn: string | null;
  lastLeadAction: string | null;
  lastDevice: string;
  /** From the latest audit_log entry with a location. */
  lastCountry: string;
  lastLocation: string;
  lastIp: string;
  leads: number;
  pages: number;
}

export interface AuditEvent {
  id: string;
  at: string;
  /** The person who did it, when it was a person. */
  actorId: string | null;
  /** Who did it, when it wasn't a signed-in person: "Automation", "Facebook ad", "The lead"… */
  actorLabel: string;
  /** The account it happened in. */
  accountId: string | null;
  category: AuditCategory;
  action: string;
  target?: string;
  before?: string;
  after?: string;
  device: string;
  via: string;
  ip?: string;
  country?: string;
  location?: string;
}

/** PostgREST returns at most 1000 rows per request: page through. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, cap = 10000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** "Mozilla/5.0 (Linux; Android 14…) Chrome/…" → "Chrome · Android". */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return "";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [browser, os].filter(Boolean).join(" · ") || "Unknown device";
}

const VIA: Record<string, string> = {
  dashboard: "EstateKit app",
  action_link: "WhatsApp alert link",
  automation: "Automation",
  facebook: "Facebook ad",
  website: "EstateKit page",
  backfill: "Import",
  system: "System",
};

interface EventRow {
  id: string;
  created_at: string;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  source: string;
  actor_id: string | null;
  agent_id: string | null;
  device: string | null;
  lead: { name: string | null } | null;
}

const EMAIL_ACTION: Record<string, string> = {
  email_sent: "Email sent to lead",
  email_failed: "Email failed to send",
  email_delivered: "Email delivered",
  email_delayed: "Email delayed",
  email_bounced: "Email bounced",
  email_complained: "Lead marked email as spam",
  email_opened: "Lead opened email",
  email_clicked: "Lead clicked a link in an email",
};

function toEvent(r: EventRow): AuditEvent {
  const base = {
    id: r.id,
    at: r.created_at,
    actorId: r.actor_id,
    accountId: r.agent_id,
    target: r.lead?.name ?? undefined,
    device: deviceLabel(r.device),
    via: VIA[r.source] ?? r.source,
  };
  const person = (fallback: string) => ({ actorLabel: r.actor_id ? "" : fallback });
  switch (r.event_type) {
    case "created":
      return { ...base, ...person(VIA[r.source] ?? "System"), category: "leads", action: "New lead came in" };
    case "stage_changed":
      return { ...base, ...person(r.source === "backfill" ? "Import" : "System"), category: "leads", action: "Moved lead", before: r.from_value ?? undefined, after: r.to_value ?? undefined };
    case "call":
      return { ...base, ...person("Unknown"), category: "leads", action: "Called lead" };
    case "note_changed":
      return { ...base, ...person("System"), category: "leads", action: "Edited note", before: r.from_value ?? undefined, after: r.to_value ?? undefined };
    case "archived":
      return { ...base, ...person("System"), category: "leads", action: "Archived lead" };
    case "restored":
      return { ...base, ...person("System"), category: "leads", action: "Restored lead" };
    case "pipeline_moved":
      return { ...base, ...person("System"), category: "leads", action: "Moved lead to another pipeline", before: r.from_value ?? undefined, after: r.to_value ?? undefined };
    case "whatsapp_sent":
      return { ...base, ...person("Automation"), category: "automations", action: "WhatsApp nudge sent to agent", after: r.to_value ?? undefined };
    case "plan_opened":
      return { ...base, actorLabel: "The lead", actorId: null, category: "automations", action: "Lead opened their Marketing Plan" };
    default:
      if (r.event_type.startsWith("email_")) {
        const byLead = r.event_type === "email_opened" || r.event_type === "email_clicked" || r.event_type === "email_complained";
        return { ...base, actorLabel: byLead ? "The lead" : "Automation", actorId: null, category: "automations", action: EMAIL_ACTION[r.event_type] ?? r.event_type, after: r.to_value ?? undefined };
      }
      return { ...base, ...person("System"), category: "leads", action: r.event_type };
  }
}

const AUDIT_ACTION: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  form_type_changed: "Changed the form type",
  email_switched: "Switched the confirmation email",
  email_wording_changed: "Changed the confirmation email wording",
  client_details_edited: "Edited client details",
  whatsapp_number_changed: "Changed the WhatsApp number",
  page_link_changed: "Changed a page link",
  lead_page_created: "Created a lead page",
  lead_page_deleted: "Deleted a lead page",
  sold_listing_added: "Added a recent sale",
  ad_paused: "Paused an ad",
  ad_resumed: "Turned an ad back on",
  automation_toggled: "Switched an automation",
  automations_stopped: "Emergency stop: all automations off",
  account_switched: "Switched account",
  password_reset: "Reset a password",
  account_deactivated: "Deactivated an account",
  account_reactivated: "Reactivated an account",
};

interface AuditRow {
  id: string;
  created_at: string;
  event: string;
  category: string;
  actor_id: string | null;
  account_id: string | null;
  detail: string | null;
  ip: string | null;
  country: string | null;
  location: string | null;
  device: string | null;
}

const AUDIT_COLS = "id, created_at, event, category, actor_id, account_id, detail, ip, country, location, device";

function fromAudit(r: AuditRow): AuditEvent {
  return {
    id: `a-${r.id}`,
    at: r.created_at,
    actorId: r.actor_id,
    actorLabel: r.actor_id ? "" : "Not signed in",
    accountId: r.account_id,
    category: (["login", "setup", "ads", "automations", "account"].includes(r.category) ? r.category : "setup") as AuditCategory,
    action: AUDIT_ACTION[r.event] ?? r.event,
    target: r.detail ?? undefined,
    device: deviceLabel(r.device),
    via: "EstateKit app",
    ip: r.ip ?? undefined,
    country: r.country ?? undefined,
    location: r.location ?? undefined,
  };
}

/** audit_log rows, or none if the table isn't there yet (it's created by a migration). */
async function auditRows(build: () => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<AuditRow[]> {
  const { data, error } = await build();
  if (error) {
    if (error.code === "42P01" || /audit_log/.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as AuditRow[];
}

interface ActivityRow { agent_id: string; last_seen: string | null; last_in_app: string | null; last_lead_action: string | null }

export interface AuditData {
  users: AuditUser[];
  events: AuditEvent[];
  /** True when the date range held more events than we load at once. */
  capped: boolean;
}

const EVENT_CAP = 5000;

export async function getAuditData(sinceIso: string): Promise<AuditData> {
  const [profilesRes, activityRes, leadRows, pageRows, deviceRows, eventRows, auditInRange, auditLatest] = await Promise.all([
    supabase.from("agent_profiles").select("agent_id, display_name, whatsapp_number, email, company, area, tier, is_operator, automations_paused, renewal_date, deactivated_at"),
    supabase.rpc("operator_last_activity"),
    fetchAll<{ agent_id: string }>((a, b) => supabase.from("leads").select("agent_id").eq("archived", false).range(a, b)),
    fetchAll<{ agent_id: string }>((a, b) => supabase.from("lead_pages").select("agent_id").range(a, b)),
    supabase.from("lead_events").select("actor_id, device, created_at").not("actor_id", "is", null).not("device", "is", null).order("created_at", { ascending: false }).limit(1000),
    fetchAll<EventRow>(
      (a, b) => supabase
        .from("lead_events")
        .select("id, created_at, event_type, from_value, to_value, source, actor_id, agent_id, device, lead:leads(name)")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .range(a, b) as unknown as PromiseLike<{ data: EventRow[] | null; error: { message: string } | null }>,
      EVENT_CAP,
    ),
    auditRows(() => supabase.from("audit_log").select(AUDIT_COLS).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(EVENT_CAP)),
    auditRows(() => supabase.from("audit_log").select(AUDIT_COLS).not("actor_id", "is", null).not("country", "is", null).order("created_at", { ascending: false }).limit(1000)),
  ]);
  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (activityRes.error) throw new Error(activityRes.error.message);

  const count = (rows: { agent_id: string }[]) => rows.reduce((m, r) => m.set(r.agent_id, (m.get(r.agent_id) ?? 0) + 1), new Map<string, number>());
  const leadCount = count(leadRows);
  const pageCount = count(pageRows);
  const activity = new Map(((activityRes.data ?? []) as ActivityRow[]).map((a) => [a.agent_id, a]));
  const lastPlace = new Map<string, AuditRow>();
  for (const a of auditLatest) if (a.actor_id && !lastPlace.has(a.actor_id)) lastPlace.set(a.actor_id, a);
  const lastDevice = new Map<string, string>();
  for (const d of (deviceRows.data ?? []) as { actor_id: string; device: string }[]) {
    if (!lastDevice.has(d.actor_id)) lastDevice.set(d.actor_id, deviceLabel(d.device));
  }

  const users: AuditUser[] = (profilesRes.data ?? []).map((p): AuditUser => {
    const a = activity.get(p.agent_id);
    return {
      id: p.agent_id,
      name: p.display_name || "Unnamed",
      role: p.is_operator ? "Operator" : "Agent",
      phone: p.whatsapp_number ?? "",
      email: p.email ?? "",
      company: p.company ?? "",
      area: p.area ?? "",
      plan: p.tier === "paid" ? "Paid" : "Free",
      status: p.deactivated_at ? "Deactivated" : p.automations_paused ? "Automations paused" : "Active",
      renewalDate: p.renewal_date,
      lastSeen: a?.last_seen ?? null,
      lastSignIn: a?.last_in_app ?? null,
      lastLeadAction: a?.last_lead_action ?? null,
      lastDevice: lastDevice.get(p.agent_id) || deviceLabel(lastPlace.get(p.agent_id)?.device),
      lastCountry: lastPlace.get(p.agent_id)?.country ?? "",
      lastLocation: lastPlace.get(p.agent_id)?.location ?? "",
      lastIp: lastPlace.get(p.agent_id)?.ip ?? "",
      leads: leadCount.get(p.agent_id) ?? 0,
      pages: pageCount.get(p.agent_id) ?? 0,
    };
  }).sort((x, y) => (y.lastSeen ?? "").localeCompare(x.lastSeen ?? ""));

  // Sign-ins now come from audit_log. For anyone with none logged there yet
  // (before the table existed), fall back to their latest sign-in time.
  const audited = auditInRange.map(fromAudit);
  const loggedIn = new Set(audited.filter((e) => e.category === "login" && e.actorId).map((e) => e.actorId));
  const signIns: AuditEvent[] = users
    .filter((u) => u.lastSignIn && u.lastSignIn >= sinceIso && !loggedIn.has(u.id))
    .map((u) => ({ id: `signin-${u.id}`, at: u.lastSignIn!, actorId: u.id, actorLabel: "", accountId: u.id, category: "login", action: "Last signed in", device: u.lastDevice, via: "EstateKit app" }));

  const events = [...eventRows.map(toEvent), ...audited, ...signIns].sort((x, y) => y.at.localeCompare(x.at));
  return { users, events, capped: eventRows.length >= EVENT_CAP };
}
