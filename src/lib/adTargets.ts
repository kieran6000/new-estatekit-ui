// The ads table's columns, named exactly as in Ads Manager, and the media
// buyer's targets for four of them: each is on target, close (within 20%)
// or off target. No colour under R150 spend or fewer than 3 leads: too
// little to judge. All are Facebook's except the four marked (EstateKit):
// what came of the leads here.

import type { AdNumbers } from "../api/agentProfile";

export type Tone = "good" | "near" | "bad" | "none";
export type AdRowNumbers = AdNumbers;

export type MetricKey = "spend" | "leads" | "cpl" | "impressions" | "reach" | "freq" | "cpm" | "clicks" | "cpc" | "ctr" | "lpv" | "booked" | "cpb" | "mandates" | "cpmand";

export interface MetricDef {
  key: MetricKey;
  /** Facebook's name for it. */
  label: string;
  /** The target as shown under the column name. */
  target?: string;
  /** target and direction: up = higher is better. */
  rule?: { value: number; up: boolean };
}

// In Ads Manager's order (its "Performance" columns).
export const METRICS: MetricDef[] = [
  { key: "leads", label: "Results" },
  { key: "reach", label: "Reach" },
  { key: "freq", label: "Frequency", target: "under 2.5", rule: { value: 2.5, up: false } },
  { key: "cpl", label: "Cost per result", target: "under R60", rule: { value: 60, up: false } },
  { key: "spend", label: "Amount spent" },
  { key: "impressions", label: "Impressions" },
  { key: "cpm", label: "CPM (cost per 1,000 impressions)", target: "R40 – R80", rule: { value: 80, up: false } },
  { key: "clicks", label: "Link clicks" },
  { key: "cpc", label: "CPC (cost per link click)" },
  { key: "ctr", label: "CTR (link click-through rate)", target: "1.5%+", rule: { value: 1.5, up: true } },
  { key: "lpv", label: "Landing page views" },
  { key: "booked", label: "Booked (EstateKit)" },
  { key: "cpb", label: "Cost per booking (EstateKit)" },
  { key: "mandates", label: "Mandates (EstateKit)" },
  { key: "cpmand", label: "Cost per mandate (EstateKit)" },
];

export function metricValues(r: AdRowNumbers): Record<MetricKey, number | null> {
  return {
    spend: r.spend,
    leads: r.leads,
    cpl: r.leads ? r.spend / r.leads : null,
    impressions: r.impressions,
    reach: r.reach || null,
    freq: r.frequency || null,
    cpm: r.impressions ? (r.spend / r.impressions) * 1000 : null,
    clicks: r.clicks,
    cpc: r.clicks ? r.spend / r.clicks : null,
    ctr: r.impressions ? (r.clicks / r.impressions) * 100 : null,
    // Instant forms have no landing page.
    lpv: r.lpv || null,
    booked: r.booked ?? null,
    cpb: r.booked ? r.spend / r.booked : null,
    mandates: r.mandates ?? null,
    cpmand: r.mandates ? r.spend / r.mandates : null,
  };
}

export function toneOf(def: MetricDef, value: number | null, r: Pick<AdRowNumbers, "spend" | "leads">): Tone {
  if (!def.rule || value === null || r.spend < 150 || r.leads < 3) return "none";
  const { value: t, up } = def.rule;
  if (up) return value >= t ? "good" : value >= t * 0.8 ? "near" : "bad";
  return value <= t ? "good" : value <= t * 1.2 ? "near" : "bad";
}

/** Add rows up for the totals row. Reach and frequency can't be added up
 *  (the same person is in several rows), so they're left out: the account
 *  totals carry the real ones. */
export function sumRows(rows: AdRowNumbers[]): AdRowNumbers {
  return rows.reduce(
    (a, r) => ({ spend: a.spend + r.spend, impressions: a.impressions + r.impressions, reach: 0, clicks: a.clicks + r.clicks, frequency: 0, leads: a.leads + r.leads, lpv: a.lpv + r.lpv, booked: (a.booked ?? 0) + (r.booked ?? 0), mandates: (a.mandates ?? 0) + (r.mandates ?? 0) }),
    { spend: 0, impressions: 0, reach: 0, clicks: 0, frequency: 0, leads: 0, lpv: 0, booked: 0, mandates: 0 } as AdRowNumbers,
  );
}

/** Ads Manager's number formats: R1,634.64 for money, 9,318 for counts. */
export const adsMoney = (n: number) => "R" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function formatMetric(k: MetricKey, v: number | null): string {
  if (v === null) return "—";
  if (k === "spend" || k === "cpl" || k === "cpm" || k === "cpc" || k === "cpb" || k === "cpmand") return adsMoney(v);
  if (k === "ctr") return v.toFixed(2) + "%";
  if (k === "freq") return v.toFixed(2);
  return Math.round(v).toLocaleString("en-US");
}
