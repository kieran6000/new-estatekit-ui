import { useQuery } from "@tanstack/react-query";
import * as overviewApi from "../api/overview";
import type { OverviewDailyRow } from "../types";

export type OverviewPeriod = "This month" | "Last 30 days" | "Last 7 days" | "Lifetime";

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

function toComputed(r: OverviewDailyRow): OverviewComputedRow {
  return {
    date: r.date,
    ...computeDerived({
      spend: Number(r.spend),
      leads: r.leads,
      leadsReached: r.leads_reached,
      appts: r.appts,
      apptsHeld: r.appts_held,
      mandates: r.mandates,
      commExpected: Number(r.commission_expected),
      commEarned: Number(r.commission_earned),
    }),
  };
}

export function useOverview(period: OverviewPeriod) {
  return useQuery({
    queryKey: ["overview", period],
    queryFn: async (): Promise<OverviewComputedRow[]> => {
      const rows = await overviewApi.listOverviewDaily();
      const from = fromDateFor(period);
      return rows.filter((r) => !from || r.date >= from).map(toComputed);
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
      const rows = await overviewApi.listOverviewDaily();
      let spend = 0;
      let leads = 0;
      rows.filter((r) => r.date >= fromStr).forEach((r) => {
        spend += Number(r.spend);
        leads += r.leads;
      });
      return leads ? Math.round(spend / leads) : 0;
    },
  });
}
