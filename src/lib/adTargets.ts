// The media buyer's targets for the "Ad sets & ads" table (from the Client
// Ads design): each metric is on target, close (within 20%) or off target.
// No colour under R150 spend or fewer than 3 leads: too little to judge.

export type Tone = "good" | "near" | "bad" | "none";

export interface AdRowNumbers {
  spend: number;
  impressions: number;
  clicks: number;
  lpv: number;
  leads: number;
  frequency: number;
}

export interface MetricDef {
  key: "spend" | "leads" | "cpl" | "cpm" | "ctr" | "load" | "cvr" | "freq";
  label: string;
  /** The target as shown under the column name. */
  target: string;
  /** target and direction: up = higher is better. */
  rule?: { value: number; up: boolean };
}

export const METRICS: MetricDef[] = [
  { key: "spend", label: "Spend", target: "" },
  { key: "leads", label: "Leads", target: "" },
  { key: "cpl", label: "CPL", target: "under R60", rule: { value: 60, up: false } },
  { key: "cpm", label: "CPM", target: "R40 – R80", rule: { value: 80, up: false } },
  { key: "ctr", label: "Link CTR", target: "1.5%+", rule: { value: 1.5, up: true } },
  { key: "load", label: "LP load", target: "80%+", rule: { value: 80, up: true } },
  { key: "cvr", label: "LP CVR", target: "15%+", rule: { value: 15, up: true } },
  { key: "freq", label: "Frequency", target: "under 2.5", rule: { value: 2.5, up: false } },
];

/** Each metric's value; null when it can't be worked out (e.g. no landing
 *  page for an instant form, so no LP load or LP CVR). */
export function metricValues(r: AdRowNumbers): Record<MetricDef["key"], number | null> {
  // Landing-page numbers only mean something when the leads came from the
  // page: more leads than page visits = instant-form leads (900% CVR).
  const lp = r.lpv > 0 && r.leads <= r.lpv;
  return {
    spend: r.spend,
    leads: r.leads,
    cpl: r.leads ? r.spend / r.leads : null,
    cpm: r.impressions ? (r.spend / r.impressions) * 1000 : null,
    ctr: r.impressions ? (r.clicks / r.impressions) * 100 : null,
    load: lp && r.clicks ? (r.lpv / r.clicks) * 100 : null,
    cvr: lp ? (r.leads / r.lpv) * 100 : null,
    freq: r.frequency || null,
  };
}

export function toneOf(def: MetricDef, value: number | null, r: Pick<AdRowNumbers, "spend" | "leads">): Tone {
  if (!def.rule || value === null || r.spend < 150 || r.leads < 3) return "none";
  const { value: t, up } = def.rule;
  if (up) return value >= t ? "good" : value >= t * 0.8 ? "near" : "bad";
  return value <= t ? "good" : value <= t * 1.2 ? "near" : "bad";
}

/** Add rows up for the footer (frequency: the average, as in the design). */
export function sumRows(rows: AdRowNumbers[]): AdRowNumbers {
  const t = rows.reduce((a, r) => ({ spend: a.spend + r.spend, impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks, lpv: a.lpv + r.lpv, leads: a.leads + r.leads, frequency: a.frequency + r.frequency }), { spend: 0, impressions: 0, clicks: 0, lpv: 0, leads: 0, frequency: 0 });
  return { ...t, frequency: rows.length ? t.frequency / rows.length : 0 };
}
