// Facebook's activity log, in words people use.

const MONEY = /bill|budget|spend|charge|payment/i;
const WORDS: Record<string, string> = { "Pending Process": "In review", "Pending Review": "In review", Inactive: "Off", Active: "On" };

function plain(value: string, isMoney: boolean): string {
  const v = (value ?? "").trim();
  if (!v || /object Object/.test(v)) return "";
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
export function worthShowing(item: { what: string; type: string; change: { from: string; to: string } | null }): boolean {
  if (/after it finishes ad review/i.test(item.what)) return false;
  return plainChange(item)?.to !== "In review";
}
