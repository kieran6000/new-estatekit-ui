// Facebook's activity log, in words people use.

const MONEY = /bill|budget|spend|charge|payment|create_ad_set|create_campaign/i;
const WORDS: Record<string, string> = {
  "Pending Process": "In review", "Pending Review": "In review", Inactive: "Off", Active: "On",
  LOWEST_COST_BID_STRATEGY: "Lowest cost", LOWEST_COST_WITH_BID_CAP: "Bid cap", COST_CAP: "Cost cap", LOWEST_COST_WITH_MIN_ROAS: "Minimum return",
};

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
  // Facebook logs some saves where nothing actually changed.
  if (item.change?.from && item.change.from === item.change.to) return false;
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

type Item = { what: string; type: string; change: { from: string; to: string } | null };

const LAUNCH: Record<string, "campaigns" | "adSets" | "ads"> = { create_campaign_group: "campaigns", create_ad_set: "adSets", create_ad: "ads" };

/** The 20% that moves results: a real change to budget, targeting, bidding or
 *  the ad's picture, or something new going out. A setting filled in when
 *  something was created isn't a change, and neither is switching an ad on or off. */
export function isKeyChange(item: Item): boolean {
  if (LAUNCH[item.type]) return true;
  if (/scheduling|audience/i.test(`${item.type} ${item.what}`)) return false;
  const kind = changeKind(item);
  if (kind === "budget" || kind === "targeting" || kind === "bidding") return !!item.change?.from && item.change.from !== item.change.to;
  if (item.type === "update_ad_creative") return !!changedImages(item)?.from && !!changedImages(item)?.to;
  return false;
}

const targetingBits = (text: string) =>
  text.replace(/\s*\([^)]*\)/g, "").split(/[;,]/).map((b) => b.replace(/^Location:\s*(South Africa:\s*)?/i, "").trim()).filter((b) => b && !/[{}"\[\]]/.test(b)); // Custom audiences come as code: no use to anyone.

/** What a targeting change added and removed, rather than two long lists. */
export function targetingDiff(from: string, to: string): { added: string[]; removed: string[] } {
  const before = targetingBits(from);
  const after = targetingBits(to);
  return { added: after.filter((b) => !before.includes(b)), removed: before.filter((b) => !after.includes(b)) };
}

export interface DayRowItem<T> { it: T; times: number }

/** One day's changes: new launches and changed pictures added up, and repeats of the same change as one row. */
export function summariseDay<T extends Item & { objectName: string }>(items: T[]): { launch: { campaigns: number; adSets: number; ads: number } | null; pictures: number; rows: DayRowItem<T>[] } {
  const launch = { campaigns: 0, adSets: 0, ads: 0 };
  const seen = new Map<string, DayRowItem<T>>();
  const pictured = new Set<string>();
  for (const it of items) {
    const made = LAUNCH[it.type];
    if (made) { launch[made] += 1; continue; }
    if (changedImages(it)) { pictured.add(it.objectName); continue; }
    const key = [it.what, it.objectName, it.change?.from, it.change?.to].join("|");
    const hit = seen.get(key);
    if (hit) hit.times += 1;
    else seen.set(key, { it, times: 1 });
  }
  return { launch: launch.campaigns + launch.adSets + launch.ads ? launch : null, pictures: pictured.size, rows: [...seen.values()] };
}

/** The months a date range touches, as "2026-10", oldest first. */
export function monthsBetween(since: string, until: string): string[] {
  const out: string[] = [];
  let [y, m] = since.slice(0, 7).split("-").map(Number);
  const [ey, em] = until.slice(0, 7).split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/** A month laid out like a wall calendar, Monday first: blanks, then "2026-10-01"… */
export function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const blanks = (first.getUTCDay() + 6) % 7;
  return [...Array(blanks).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
}
