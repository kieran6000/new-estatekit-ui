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
  spend: number;
  leads: number;
  appts: number;
  mandates: number;
  comm: number;
  cpl: number;
}

function toComputed(r: OverviewDailyRow): OverviewComputedRow {
  return {
    date: r.date,
    spend: Number(r.spend),
    leads: r.leads,
    appts: r.appts,
    mandates: r.mandates,
    comm: Number(r.commission),
    cpl: r.leads ? Number(r.spend) / r.leads : 0,
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
