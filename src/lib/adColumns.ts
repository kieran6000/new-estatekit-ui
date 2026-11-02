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

/** Every column, in Ads Manager's order. */
export const ALL_COLUMNS: ColId[] = ["delivery", "leads", "reach", "freq", "cpl", "budget", "spend", "ends", "impressions", "cpm", "clicks", "cpc", "ctr", "lpv"];

export type PresetKey = "performance" | "performance_clicks";
export const PRESETS: Record<PresetKey, { label: string; cols: ColId[] }> = {
  performance: { label: "Performance", cols: ["delivery", "leads", "reach", "freq", "cpl", "budget", "spend", "ends"] },
  performance_clicks: { label: "Performance and clicks", cols: ["delivery", "leads", "reach", "freq", "cpl", "budget", "spend", "ends", "impressions", "cpm", "clicks", "cpc", "ctr", "lpv"] },
};

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

/** The columns to show. Ads have no budget or end date of their own. */
export function visibleColumns(p: ColumnPrefs, level: "campaign" | "adset" | "ad"): ColId[] {
  const cols = p.choice === "custom" ? p.custom : PRESETS[p.choice].cols;
  return cols.filter((c) => level !== "ad" || (c !== "budget" && c !== "ends"));
}

export const choiceLabel = (p: ColumnPrefs) => (p.choice === "custom" ? "Custom" : PRESETS[p.choice].label);
