import { useEffect, useState } from "react";

// Date ranges for the Accounts pages. All dates are local calendar days;
// `until` is exclusive (the start of the day after the last day shown).

export type RangeKey = "today" | "yesterday" | "3d" | "7d" | "14d" | "30d" | "90d" | "this_month" | "last_month" | "all" | "custom";

export interface DateRange {
  key: RangeKey;
  /** Custom only: first and last day, "YYYY-MM-DD". */
  from?: string;
  to?: string;
}

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "3d": "Last 3 days",
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  this_month: "This month",
  last_month: "Last month",
  all: "Maximum",
  custom: "Custom dates",
};

/** The presets, as in Ads Manager. "Maximum" goes back 37 months, as far
 *  as Facebook reports. (90 days stays valid for ranges saved before.) */
export const DEFAULT_RANGES: RangeKey[] = ["today", "yesterday", "3d", "7d", "14d", "30d", "this_month", "last_month", "all", "custom"];
export const ALL_RANGES: RangeKey[] = DEFAULT_RANGES;

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
    case "today":
      return { since: today, until: tomorrow, label: RANGE_LABELS.today };
    case "yesterday":
      return { since: addDays(today, -1), until: today, label: RANGE_LABELS.yesterday };
    case "all":
      return { since: new Date(today.getFullYear(), today.getMonth() - 37, today.getDate()), until: tomorrow, label: RANGE_LABELS.all };
    case "3d":
      return { since: addDays(today, -2), until: tomorrow, label: RANGE_LABELS["3d"] };
    case "7d":
      return { since: addDays(today, -6), until: tomorrow, label: RANGE_LABELS["7d"] };
    case "14d":
      return { since: addDays(today, -13), until: tomorrow, label: RANGE_LABELS["14d"] };
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

/** The days a range covers, as people say them: "1 Nov 2026",
 *  "25 – 31 Oct 2026", "29 Sep – 5 Oct 2026", "28 Dec 2025 – 3 Jan 2026". */
export function rangeDates(r: DateRange): string {
  const { since, until } = resolveRange(r);
  const last = addDays(until, -1);
  const d = (x: Date) => String(x.getDate());
  const m = (x: Date) => x.toLocaleDateString("en-ZA", { month: "short" });
  const y = (x: Date) => String(x.getFullYear());
  if (r.key === "all") return `Since ${m(since)} ${y(since)}`;
  if (ymd(since) === ymd(last)) return `${d(last)} ${m(last)} ${y(last)}`;
  if (y(since) !== y(last)) return `${d(since)} ${m(since)} ${y(since)} – ${d(last)} ${m(last)} ${y(last)}`;
  if (m(since) !== m(last)) return `${d(since)} ${m(since)} – ${d(last)} ${m(last)} ${y(last)}`;
  return `${d(since)} – ${d(last)} ${m(last)} ${y(last)}`;
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
