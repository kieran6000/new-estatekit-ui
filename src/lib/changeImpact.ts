// What happened after a change on an ad account: the week before against the
// week after, for the whole account. It shows what followed a change, which
// isn't proof the change caused it.

export const WINDOW_DAYS = 7;
const MIN_DAYS_AFTER = 3;
const MIN_LEADS = 3;
/** A smaller move than this in cost per lead counts as about the same. */
const SAME_WITHIN = 0.15;

export type Verdict = "better" | "worse" | "same" | "soon" | "few" | "not_running";

export interface Period { leads: number; spend: number; costPerLead: number | null; days: number }
export interface Impact { before: Period; after: Period; verdict: Verdict }

export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function period(from: number, to: number, day: string, today: string, leads: Record<string, number>, spend: Record<string, number>): Period {
  const out = { leads: 0, spend: 0, days: 0 };
  for (let i = from; i <= to; i++) {
    const d = addDays(day, i);
    if (d >= today) break; // Today isn't over yet.
    out.leads += leads[d] ?? 0;
    out.spend += Number(spend[d]) || 0;
    out.days += 1;
  }
  return { ...out, costPerLead: out.leads > 0 && out.spend > 0 ? out.spend / out.leads : null };
}

export function impactOf(day: string, today: string, leads: Record<string, number>, spend: Record<string, number>): Impact {
  const before = period(-WINDOW_DAYS, -1, day, today, leads, spend);
  const after = period(1, WINDOW_DAYS, day, today, leads, spend);
  const verdict = ((): Verdict => {
    if (after.days < MIN_DAYS_AFTER) return "soon";
    if (before.spend === 0 || after.spend === 0) return "not_running";
    if (before.leads + after.leads < MIN_LEADS) return "few";
    if (before.costPerLead === null) return "better";
    if (after.costPerLead === null) return "worse";
    const move = (after.costPerLead - before.costPerLead) / before.costPerLead;
    return move <= -SAME_WITHIN ? "better" : move >= SAME_WITHIN ? "worse" : "same";
  })();
  return { before, after, verdict };
}

export type ChangeKind = "budget" | "onoff" | "new" | "billing" | "other";

export function changeKind(item: { what: string; type: string }): ChangeKind {
  const text = `${item.what} ${item.type}`;
  if (/bill|charge|payment|funding/i.test(text)) return "billing";
  if (/budget|spend.?cap|spend limit/i.test(text)) return "budget";
  if (/status|paus|activ/i.test(text)) return "onoff";
  if (/creat|added|new /i.test(text)) return "new";
  return "other";
}

/** Someone decided this, rather than Facebook doing it or a bill going out. */
export const isDecision = (item: { what: string; type: string; who: string }) =>
  changeKind(item) !== "billing" && !/^(meta|facebook)?$/i.test(item.who.trim());

/** Days or weeks for the chart, so a long range still fits. */
export function chartBuckets(since: string, until: string): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  const span = Math.round((Date.parse(until) - Date.parse(since)) / 864e5) + 1;
  const step = span > 400 ? 30 : span > 62 ? 7 : 1;
  for (let d = since; d <= until; d = addDays(d, step)) {
    const end = addDays(d, step - 1);
    out.push({ start: d, end: end > until ? until : end });
  }
  return out;
}
