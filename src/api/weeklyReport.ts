import { supabase } from "./_client";

// Real numbers for the weekly report, worked out from what the agent does in
// EstateKit. The "How these numbers are counted" box on the report must say
// the same thing as this file.
//
//   New leads        leads created in the week (archived ones too: they still arrived)
//   Leads called     of those, the ones with a Call tap or a stage change away
//                    from "New Lead", at any time up to now
//   Appointments     leads moved to Booked / Viewing Booked during the week
//   Mandates         leads moved to Mandate Signed during the week
//   How fast         median minutes from a lead arriving to its first Call tap
//                    or stage change (imported history excluded: its times are fake)
//   Waiting now      leads on New Lead / No Answer right now (not archived)
//   Campaign         leads that came from a Facebook ad or an EstateKit page
//
// Weeks run Monday 00:00 to Sunday 23:59, South African time.

export interface Week { label: string; leads: number; called: number; booked: number; mandates: number }

export interface WeeklyReport {
  period: string;
  thisWeek: Week;
  lastWeek: Week;
  typicalMins: number | null;
  lastTypicalMins: number | null;
  notCalled: number;
  noAnswer: number;
  campaign: { thisWeek: number; total: number; since: string | null };
  /** Oldest first, the selected week last. */
  weeks: Week[];
}

const SAST = 2 * 3600_000;
const DAY = 86_400_000;
const BOOKED = ["Booked", "Viewing Booked"];

/** UTC ms of Monday 00:00 SAST for the last full week, minus `weeksBack` weeks. */
function weekStart(weeksBack: number): number {
  const nowSast = Date.now() + SAST;
  const d = new Date(nowSast);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  const thisMondaySast = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - daysSinceMonday * DAY;
  return thisMondaySast - (weeksBack + 1) * 7 * DAY - SAST;
}

const fmt = (ms: number, opts: Intl.DateTimeFormatOptions) => new Date(ms + SAST).toLocaleDateString("en-ZA", { timeZone: "UTC", ...opts });

/** "2026-09-22": the Monday (SAST) the week starts on, as a date. */
export function weekStartDate(weeksBack: number): string {
  return new Date(weekStart(weeksBack) + SAST).toISOString().slice(0, 10);
}

export function weekLabel(weeksBack: number): string {
  const s = weekStart(weeksBack);
  return `${fmt(s, { day: "numeric", month: "short" })} – ${fmt(s + 6 * DAY, { day: "numeric", month: "short", year: "numeric" })}`;
}

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

interface LeadRow { id: string; created_at: string; stage: string; archived: boolean; fb_lead_id: string | null; source_page_id: string | null }
interface EventRow { lead_id: string; event_type: string; to_value: string | null; source: string; created_at: string }

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};

export async function getWeeklyReport(agentId: string, weeksBack: number): Promise<WeeklyReport> {
  const oldest = weekStart(weeksBack + 3);
  const [leads, events] = await Promise.all([
    fetchAll<LeadRow>((a, b) => supabase.from("leads").select("id, created_at, stage, archived, fb_lead_id, source_page_id").eq("agent_id", agentId).order("created_at").range(a, b)),
    fetchAll<EventRow>((a, b) => supabase
      .from("lead_events")
      .select("lead_id, event_type, to_value, source, created_at")
      .eq("agent_id", agentId)
      .in("event_type", ["call", "stage_changed"])
      .gte("created_at", new Date(oldest).toISOString())
      .order("created_at")
      .range(a, b)),
  ]);

  // First contact per lead: a Call tap, or a stage change away from New Lead.
  const contacted = new Set<string>();
  const firstContact = new Map<string, number>(); // real (non-imported) times only
  for (const e of events) {
    const isContact = e.event_type === "call" || (e.event_type === "stage_changed" && e.to_value !== "New Lead");
    if (!isContact) continue;
    contacted.add(e.lead_id);
    if (e.source !== "backfill" && !firstContact.has(e.lead_id)) firstContact.set(e.lead_id, Date.parse(e.created_at));
  }

  const weekOf = (back: number) => {
    const s = weekStart(back), end = s + 7 * DAY;
    const inWeek = leads.filter((l) => { const t = Date.parse(l.created_at); return t >= s && t < end; });
    const moved = (stages: string[]) => new Set(events.filter((e) => e.event_type === "stage_changed" && e.source !== "backfill" && stages.includes(e.to_value ?? "") && Date.parse(e.created_at) >= s && Date.parse(e.created_at) < end).map((e) => e.lead_id)).size;
    const speeds = inWeek.flatMap((l) => { const f = firstContact.get(l.id); return f !== undefined && f >= Date.parse(l.created_at) ? [(f - Date.parse(l.created_at)) / 60000] : []; });
    return {
      week: { label: fmt(s, { day: "numeric", month: "short" }), leads: inWeek.length, called: inWeek.filter((l) => contacted.has(l.id)).length, booked: moved(BOOKED), mandates: moved(["Mandate Signed"]) },
      typical: median(speeds),
      campaign: inWeek.filter((l) => l.fb_lead_id || l.source_page_id).length,
    };
  };

  const cur = weekOf(weeksBack);
  const prev = weekOf(weeksBack + 1);
  const live = leads.filter((l) => !l.archived);
  const fromCampaign = leads.filter((l) => l.fb_lead_id || l.source_page_id);
  return {
    period: weekLabel(weeksBack),
    thisWeek: cur.week,
    lastWeek: prev.week,
    typicalMins: cur.typical,
    lastTypicalMins: prev.typical,
    notCalled: live.filter((l) => l.stage === "New Lead").length,
    noAnswer: live.filter((l) => l.stage === "No Answer").length,
    campaign: {
      thisWeek: cur.campaign,
      total: fromCampaign.length,
      since: fromCampaign[0] ? new Date(fromCampaign[0].created_at).toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) : null,
    },
    weeks: [weekOf(weeksBack + 3).week, weekOf(weeksBack + 2).week, prev.week, cur.week],
  };
}
