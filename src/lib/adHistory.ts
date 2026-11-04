// Facebook's activity log, in words people use.

const MONEY = /bill|budget|spend|charge|payment/i;
const WORDS: Record<string, string> = { "Pending Process": "In review", "Pending Review": "In review", Inactive: "Off", Active: "On" };

const isLink = (v: string) => /^https?:\/\//i.test(v.trim());

/** When an ad's picture changed, Facebook gives the picture's address. */
export function changedImages(item: { change: { from: string; to: string } | null }): { from: string | null; to: string | null } | null {
  if (!item.change) return null;
  const link = (v: string) => (isLink(v ?? "") ? v.trim() : null);
  const from = link(item.change.from);
  const to = link(item.change.to);
  return from || to ? { from, to } : null;
}

function plain(value: string, isMoney: boolean): string {
  const v = (value ?? "").trim();
  if (!v || /object Object/.test(v) || isLink(v)) return "";
  // Facebook gives money in cents.
  if (isMoney && /^\d+$/.test(v)) return "R " + (Number(v) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return WORDS[v] ?? v;
}

/** What it changed from and to, or null if there's nothing readable to show. */
export function plainChange(item: { what: string; type: string; change: { from: string; to: string } | null }): { from: string; to: string } | null {
  if (!item.change) return null;
  const isMoney = MONEY.test(item.what) || MONEY.test(item.type);
  const from = plain(item.change.from, isMoney);
  const to = plain(item.change.to, isMoney);
  return from || to ? { from, to } : null;
}

/** Facebook logs each step of an ad going through review. Only the result matters. */
export function worthShowing(item: { what: string; type: string; who?: string; change: { from: string; to: string } | null }): boolean {
  if (/after it finishes ad review|^ad delivered/i.test(item.what)) return false;
  // Facebook switching an ad on after review isn't a decision anyone made.
  if (/run_status|status/i.test(`${item.what} ${item.type}`) && /^(meta|facebook)$/i.test((item.who ?? "").trim())) return false;
  return plainChange(item)?.to !== "In review";
}

export type ChangeKind = "targeting" | "budget" | "bidding" | "creative" | "onoff" | "billing" | "other";

/** The changes that move results, shown first. */
export const KEY_KINDS: ChangeKind[] = ["targeting", "budget", "bidding", "creative"];

export function changeKind(item: { what: string; type: string }): ChangeKind {
  const text = `${item.what} ${item.type}`;
  if (/budget|spend.?cap|spend.?limit/i.test(text)) return "budget";
  if (/bill|charge|payment|funding/i.test(text)) return "billing";
  if (/target|audience|placement/i.test(text)) return "targeting";
  if (/bid|optimi[sz]ation|performance goal/i.test(text)) return "bidding";
  if (/run_status|status/i.test(text)) return "onoff";
  if (/creative|ad updated|created|create_|image|video/i.test(text)) return "creative";
  return "other";
}

export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The timeline's steps: days, or weeks or months when the range is long, so it still fits. */
export function timelineSteps(since: string, until: string): { unit: "day" | "week" | "month"; steps: { start: string; end: string }[] } {
  const span = Math.round((Date.parse(until) - Date.parse(since)) / 864e5) + 1;
  const unit = span > 400 ? "month" : span > 62 ? "week" : "day";
  const size = unit === "month" ? 30 : unit === "week" ? 7 : 1;
  const steps: { start: string; end: string }[] = [];
  for (let d = since; d <= until; d = addDays(d, size)) {
    const end = addDays(d, size - 1);
    steps.push({ start: d, end: end > until ? until : end });
  }
  return { unit, steps };
}

/** A round top for the leads scale: 25 becomes 30, 7 stays 8. */
export function scaleTop(most: number): number {
  if (most <= 4) return 4;
  const size = most <= 10 ? 2 : most <= 50 ? 10 : most <= 100 ? 20 : 50;
  return Math.ceil(most / size) * size;
}
