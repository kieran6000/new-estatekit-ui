// The weekly check-in: the five questions from the team's Google form, what
// the answers add up to, and when the next one is due.

export type CheckinKey = "quality" | "volume" | "followup" | "confidence" | "happiness";
export type CheckinAnswers = Record<CheckinKey, number>;

export const QUESTIONS: { key: CheckinKey; label: string; short: string; low: string; high: string }[] = [
  { key: "quality", label: "How good were your leads this week?", short: "Lead quality", low: "Poor", high: "Great" },
  { key: "volume", label: "Did you get enough leads this week?", short: "Enough leads", low: "Far too few", high: "Plenty" },
  { key: "followup", label: "How well did you follow up with your leads?", short: "Follow-up", low: "Hardly", high: "Every one" },
  { key: "confidence", label: "How confident are you turning these leads into listings?", short: "Confidence", low: "Not at all", high: "Very" },
  { key: "happiness", label: "How happy are you with EstateKit this week?", short: "Happy with us", low: "Unhappy", high: "Very happy" },
];

export const COMMENT_QUESTION = "One thing we could do better? (optional)";

export type Risk = "green" | "amber" | "red";
export const RISK_WORDS: Record<Risk, string> = { green: "Happy", amber: "Keep an eye on", red: "At risk" };

/** What a set of answers adds up to. Red if they're unhappy with us or most
 *  things are bad; green only if it's good overall with nothing poor. */
export function scoreCheckin(a: CheckinAnswers): { average: number; risk: Risk; weak: CheckinKey[] } {
  const values = QUESTIONS.map((q) => a[q.key]);
  const average = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
  const weak = QUESTIONS.filter((q) => a[q.key] <= 3).map((q) => q.key);
  const anyPoor = values.some((v) => v <= 2);
  const risk: Risk = a.happiness <= 2 || average < 2.5 ? "red" : average >= 4 && !anyPoor ? "green" : "amber";
  return { average, risk, weak };
}

export const CHECKIN_EVERY_DAYS = 7;
/** Not answered after this long: worth a reminder. */
export const REMIND_AFTER_DAYS = 2;

export interface CheckinRow {
  created_at: string;
  shared_at: string | null;
  answered_at: string | null;
  expires_at: string;
}

const daysSince = (iso: string, now: Date) => (now.getTime() - Date.parse(iso)) / 864e5;

/** What to do next, from their check-ins (newest first). */
export function nextStep(rows: CheckinRow[], now = new Date()):
  | { kind: "send"; reason: "never" | "due"; days?: number }
  | { kind: "waiting"; sentAt: string; remind: boolean }
  | { kind: "done"; nextDue: string } {
  const live = rows.find((r) => !r.answered_at && Date.parse(r.expires_at) > now.getTime());
  const latest = rows[0];
  if (!latest) return { kind: "send", reason: "never" };
  if (live && daysSince(live.created_at, now) < CHECKIN_EVERY_DAYS) {
    const sentAt = live.shared_at ?? live.created_at;
    return { kind: "waiting", sentAt, remind: daysSince(sentAt, now) >= REMIND_AFTER_DAYS };
  }
  const last = Date.parse(latest.created_at);
  const days = Math.floor(daysSince(latest.created_at, now));
  if (days >= CHECKIN_EVERY_DAYS) return { kind: "send", reason: "due", days };
  return { kind: "done", nextDue: new Date(last + CHECKIN_EVERY_DAYS * 864e5).toISOString() };
}

/** The WhatsApp message with their link. */
export function checkinMessage(firstName: string, fromName: string, link: string): string {
  const hi = firstName ? `Hi ${firstName}` : "Hi";
  const from = fromName ? `, it's ${fromName} from EstateKit` : " from EstateKit";
  return `${hi}${from}. Quick check-in on your week: it takes a minute, just tap the numbers, no typing needed.\n${link}`;
}
