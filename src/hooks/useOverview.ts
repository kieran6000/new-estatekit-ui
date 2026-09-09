import { useQuery } from "@tanstack/react-query";
import { listLeads } from "../api/leads";
import { getMyProfile, getFbAdInsights } from "../api/agentProfile";
import type { LeadRow, Stage } from "../types";

export type OverviewPeriod = "This month" | "Last 30 days" | "Last 7 days" | "Lifetime" | "Custom";
export interface DateRange { from: string; to: string }

function fromDateFor(period: OverviewPeriod): string | null {
  const today = new Date();
  if (period === "Last 7 days") {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  }
  if (period === "Last 30 days") {
    const d = new Date(today);
    d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  }
  if (period === "This month") {
    return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  }
  return null; // Lifetime
}

/** The from/to the Overview is currently showing, so other panels (ad KPIs)
 *  can report over exactly the same window. */
export function rangeFor(period: OverviewPeriod, range?: DateRange): { from: string | null; to: string | null } {
  if (period === "Custom") return { from: range?.from || null, to: range?.to || null };
  return { from: fromDateFor(period), to: null };
}

export interface OverviewComputedRow {
  date: string;
  // raw counts (also the totals-row aggregation inputs)
  spend: number;
  leads: number;
  leadsReached: number;
  appts: number;
  apptsHeld: number;
  mandates: number;
  commExpected: number;
  commEarned: number;
  // derived — Simple view
  cpl: number;
  // derived — Advanced view only
  costPerReachedLead: number;
  costPerAppt: number;
  apptToMandatePct: number;
  leadToMandatePct: number;
  costPerMandate: number;
  expectedProfit: number;
  actualProfit: number;
  expectedRoi: number;
  actualRoi: number;
}

type RawTotals = Pick<
  OverviewComputedRow,
  "spend" | "leads" | "leadsReached" | "appts" | "apptsHeld" | "mandates" | "commExpected" | "commEarned"
>;

/** Turns raw counts into every derived ratio the Overview table shows.
 * Shared by the per-day mapping and the totals row, so a total is always the
 * ratio of summed counts — never a sum of already-computed percentages. */
export function computeDerived(raw: RawTotals): Omit<OverviewComputedRow, "date"> {
  const { spend, leads, leadsReached, appts, mandates, commExpected, commEarned } = raw;
  return {
    ...raw,
    cpl: leads ? spend / leads : 0,
    costPerReachedLead: leadsReached ? spend / leadsReached : 0,
    costPerAppt: appts ? spend / appts : 0,
    apptToMandatePct: appts ? mandates / appts : 0,
    leadToMandatePct: leads ? mandates / leads : 0,
    costPerMandate: mandates ? spend / mandates : 0,
    expectedProfit: commExpected - spend,
    actualProfit: commEarned - spend,
    expectedRoi: spend ? (commExpected - spend) / spend : 0,
    actualRoi: spend ? (commEarned - spend) / spend : 0,
  };
}

// Stage groupings — a lead's *current* stage tells us how far it got, so the
// Overview reflects reality the moment a stage changes (no separate logging).
const REACHED: Stage[] = ["Contacted", "Booked", "Mandate Signed", "Viewing Booked", "Offer Made", "Bought"];
const APPTS: Stage[] = ["Booked", "Mandate Signed", "Viewing Booked", "Offer Made", "Bought"];
const APPTS_HELD: Stage[] = ["Mandate Signed", "Offer Made", "Bought"];
const WINS: Stage[] = ["Mandate Signed", "Bought"];

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Build per-day Overview rows from the lead list, cohorted by the day each
 *  lead came in, and merge in real daily ad spend from Meta. */
function buildRows(leads: LeadRow[], dailySpend: Record<string, number>, from: string | null, to: string | null = null): OverviewComputedRow[] {
  const raw: Record<string, {
    spend: number; leads: number; leadsReached: number; appts: number;
    apptsHeld: number; mandates: number; commExpected: number; commEarned: number;
  }> = {};

  const ensure = (d: string) => (raw[d] ??= { spend: 0, leads: 0, leadsReached: 0, appts: 0, apptsHeld: 0, mandates: 0, commExpected: 0, commEarned: 0 });

  for (const l of leads) {
    const d = dateKey(l.created_at);
    if (from && d < from) continue;
    if (to && d > to) continue;
    const row = ensure(d);
    row.leads += 1;
    if (REACHED.includes(l.stage)) row.leadsReached += 1;
    if (APPTS.includes(l.stage)) row.appts += 1;
    if (APPTS_HELD.includes(l.stage)) row.apptsHeld += 1;
    if (WINS.includes(l.stage)) {
      row.mandates += 1;
      row.commEarned += l.commission ?? 0;
    }
    if (l.commission && l.stage !== "Lost" && l.stage !== "Invalid Number") {
      row.commExpected += l.commission;
    }
  }

  for (const [d, spend] of Object.entries(dailySpend)) {
    if (from && d < from) continue;
    if (to && d > to) continue;
    ensure(d).spend += spend;
  }

  return Object.entries(raw)
    .map(([date, r]) => ({ date, ...computeDerived(r) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function loadDailySpend(from: string | null): Promise<Record<string, number>> {
  try {
    const profile = await getMyProfile();
    if (!profile?.fbAdAccountId) return {};
    return await getFbAdInsights(profile.fbAdAccountId, from);
  } catch {
    return {};
  }
}

/** Pass a pipelineId to scope the KPI rows to just that pipeline's leads — ad
 *  spend still comes in account-wide (Meta doesn't split spend by pipeline),
 *  so cost/lead etc. only make sense as an approximation when filtered. */
export function useOverview(period: OverviewPeriod, range?: DateRange, pipelineId?: string | null) {
  const from = period === "Custom" ? (range?.from || null) : fromDateFor(period);
  const to = period === "Custom" ? (range?.to || null) : null;
  return useQuery({
    queryKey: ["overview", period, from, to, pipelineId ?? "all"],
    // For a custom range, wait until both ends are set.
    enabled: period !== "Custom" || (!!range?.from && !!range?.to),
    queryFn: async (): Promise<OverviewComputedRow[]> => {
      const [allLeads, dailySpend] = await Promise.all([listLeads(), loadDailySpend(from)]);
      const leads = pipelineId ? allLeads.filter((l) => l.pipeline_id === pipelineId) : allLeads;
      return buildRows(leads, dailySpend, from, to);
    },
  });
}

/** Trailing-30-day cost/lead for the Leads-tab stat strip. */
export function useStatStripCpl() {
  return useQuery({
    queryKey: ["overview", "cpl30"],
    queryFn: async (): Promise<number> => {
      const from = new Date();
      from.setDate(from.getDate() - 29);
      const fromStr = from.toISOString().slice(0, 10);
      const [leads, dailySpend] = await Promise.all([listLeads(), loadDailySpend(fromStr)]);
      const leadCount = leads.filter((l) => dateKey(l.created_at) >= fromStr).length;
      const spend = Object.entries(dailySpend)
        .filter(([d]) => d >= fromStr)
        .reduce((sum, [, v]) => sum + v, 0);
      return leadCount ? Math.round(spend / leadCount) : 0;
    },
  });
}
