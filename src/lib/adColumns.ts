// The ads table's columns, as Ads Manager offers them: presets
// ("Performance", "Performance and clicks"), your own set ("Customize
// columns"), and widths you drag. Remembered on this device.

import { METRICS, type MetricKey } from "./adTargets";

export type ColId = "delivery" | "budget" | "ends" | MetricKey;

export const COLUMN_LABEL: Record<ColId, string> = {
  delivery: "Delivery",
  budget: "Budget",
  ends: "Ends",
  ...(Object.fromEntries(METRICS.map((m) => [m.key, m.label])) as Record<MetricKey, string>),
};

/** Every column, in Ads Manager's order. The agency funnel columns (showed,
 *  signed, paid) aren't offered in Customize — they only appear, in place of
 *  the seller block, on EstateKit's own /call account. */
export const ALL_COLUMNS: ColId[] = ["delivery", "leads", "reach", "freq", "cpl", "budget", "spend", "ends", "impressions", "cpm", "clicks", "cpc", "ctr", "lpv", "booked", "cpb", "mandates", "cpmand"];

export type PresetKey = "performance" | "performance_clicks" | "estatekit";
export const PRESETS: Record<PresetKey, { label: string; cols: ColId[] }> = {
  performance: { label: "Performance", cols: ["delivery", "leads", "reach", "freq", "cpl", "budget", "spend", "ends"] },
  performance_clicks: { label: "Performance and clicks", cols: ["delivery", "leads", "reach", "freq", "cpl", "budget", "spend", "ends", "impressions", "cpm", "clicks", "cpc", "ctr", "lpv"] },
  // Ours: what the leads turned into.
  estatekit: { label: "EstateKit results", cols: ["delivery", "leads", "cpl", "booked", "cpb", "mandates", "cpmand", "budget", "spend"] },
};

/** EstateKit's result columns: per campaign and ad set only (per ad, it's
 *  mostly 0 or 1) — both the seller block and the agency funnel block. */
export const EK_COLUMNS: ColId[] = ["booked", "cpb", "mandates", "cpmand", "showed", "signed", "paid"];
/** On EstateKit's own /call account, the four seller columns are replaced by
 *  the agency's own funnel steps. */
export const EK_AGENCY_COLUMNS: ColId[] = ["booked", "showed", "signed", "paid"];

export interface ColumnPrefs {
  /** A preset, or "custom" for your own set. */
  choice: PresetKey | "custom";
  custom: ColId[];
  /** Column widths you dragged, in px. */
  widths: Partial<Record<ColId | "name", number>>;
  /** Tint cells against the targets (Ads Manager's "Conditional formatting"). */
  tint: boolean;
}

export const DEFAULT_PREFS: ColumnPrefs = { choice: "performance_clicks", custom: PRESETS.performance_clicks.cols, widths: {}, tint: false };
const KEY = "ek.adsTable.columns";

export function loadPrefs(): ColumnPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!p) return DEFAULT_PREFS;
    const custom = Array.isArray(p.custom) ? (p.custom as string[]).filter((c): c is ColId => (ALL_COLUMNS as string[]).includes(c)) : DEFAULT_PREFS.custom;
    const choice = p.choice === "custom" || p.choice in PRESETS ? p.choice : DEFAULT_PREFS.choice;
    return { choice, custom, widths: typeof p.widths === "object" && p.widths ? p.widths : {}, tint: p.tint !== false };
  } catch {
    return DEFAULT_PREFS;
  }
}
export function savePrefs(p: ColumnPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* fine */ }
}

/** The columns to show. Ads have no budget or end date of their own. On
 *  EstateKit's own /call account (funnel), the seller result block is swapped
 *  for the agency's own funnel steps (Booked → Showed → Signed → Paid). */
export function visibleColumns(p: ColumnPrefs, level: "campaign" | "adset" | "ad", funnel = false): ColId[] {
  let cols = p.choice === "custom" ? p.custom : PRESETS[p.choice].cols;
  if (funnel) {
    const seller = new Set<ColId>(["cpb", "mandates", "cpmand"]);
    cols = [...new Set(cols.flatMap((c) => (c === "booked" ? EK_AGENCY_COLUMNS : seller.has(c) ? [] : [c])))];
  }
  return cols.filter((c) => level !== "ad" || (c !== "budget" && c !== "ends" && !EK_COLUMNS.includes(c)));
}

export const choiceLabel = (p: ColumnPrefs) => (p.choice === "custom" ? "Custom" : PRESETS[p.choice].label);
