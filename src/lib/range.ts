import { useEffect, useState } from "react";

// Date ranges for the Accounts pages. All dates are local calendar days;
// `until` is exclusive (the start of the day after the last day shown).

export type RangeKey = "7d" | "30d" | "90d" | "this_month" | "last_month" | "custom";

export interface DateRange {
  key: RangeKey;
  /** Custom only: first and last day, "YYYY-MM-DD". */
  from?: string;
  to?: string;
}

export const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  this_month: "This month",
  last_month: "Last month",
  custom: "Custom dates",
};

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** "YYYY-MM-DD" in local time (Meta reports spend by the ad account's day). */
export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The range as real moments: [since, until). */
export function resolveRange(r: DateRange): { since: Date; until: Date; label: string } {
  const today = day(new Date());
  const tomorrow = addDays(today, 1);
  switch (r.key) {
    case "7d":
      return { since: addDays(today, -6), until: tomorrow, label: RANGE_LABELS["7d"] };
    case "90d":
      return { since: addDays(today, -89), until: tomorrow, label: RANGE_LABELS["90d"] };
    case "this_month":
      return { since: new Date(today.getFullYear(), today.getMonth(), 1), until: tomorrow, label: RANGE_LABELS.this_month };
    case "last_month":
      return {
        since: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        until: new Date(today.getFullYear(), today.getMonth(), 1),
        label: RANGE_LABELS.last_month,
      };
    case "custom": {
      const from = r.from ? new Date(r.from + "T00:00:00") : addDays(today, -29);
      const to = r.to ? new Date(r.to + "T00:00:00") : today;
      const [a, b] = from <= to ? [from, to] : [to, from];
      const fmt = (d: Date) => d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
      return { since: a, until: addDays(b, 1), label: `${fmt(a)} – ${fmt(b)}` };
    }
    default:
      return { since: addDays(today, -29), until: tomorrow, label: RANGE_LABELS["30d"] };
  }
}

/** The chosen range, remembered on this device (one per `storageKey`). */
export function useDateRange(storageKey: string, fallback: DateRange = { key: "30d" }) {
  const [range, setRange] = useState<DateRange>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && saved.key in RANGE_LABELS) return saved as DateRange;
    } catch { /* ignore */ }
    return fallback;
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(range)); } catch { /* ignore */ }
  }, [storageKey, range]);
  return [range, setRange] as const;
}
