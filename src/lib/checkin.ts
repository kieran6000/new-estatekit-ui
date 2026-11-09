// The check-in: its questions (the team can change them), what a set of
// answers adds up to, and where a client is up to. No weekly schedule: clients
// answer when they answer, so it shows what happened and when.

export interface CheckinQuestion {
  /** Stays the same when the wording changes, so answers line up over time. */
  id: string;
  type: "rating" | "text";
  label: string;
  /** For the team's view: "Lead quality". */
  short: string;
  /** Rating only: what 1 and 5 mean. */
  low?: string;
  high?: string;
}

/** Ratings are 1-5; written answers are text. */
export type CheckinAnswers = Record<string, number | string>;

export const DEFAULT_QUESTIONS: CheckinQuestion[] = [
  { id: "quality", type: "rating", label: "How good were your leads this week?", short: "Lead quality", low: "Poor", high: "Great" },
  { id: "volume", type: "rating", label: "Did you get enough leads this week?", short: "Enough leads", low: "Far too few", high: "Plenty" },
  { id: "followup", type: "rating", label: "How well did you follow up with your leads?", short: "Follow-up", low: "Hardly", high: "Every one" },
  { id: "confidence", type: "rating", label: "How confident are you turning these leads into listings?", short: "Confidence", low: "Not at all", high: "Very" },
  { id: "happiness", type: "rating", label: "How happy are you with EstateKit this week?", short: "Happy with us", low: "Unhappy", high: "Very happy" },
  { id: "better", type: "text", label: "One thing we could do better?", short: "Could do better" },
];

/** The question that says whether they're happy with us, if it's still asked. */
const HAPPINESS = "happiness";

/** A fresh id for a new question. */
export const newQuestionId = () => "q" + Math.random().toString(36).slice(2, 9);

/** Questions as saved, checked over: anything broken is left out. */
export function cleanQuestions(raw: unknown): CheckinQuestion[] {
  if (!Array.isArray(raw)) return DEFAULT_QUESTIONS;
  const seen = new Set<string>();
  const out: CheckinQuestion[] = [];
  for (const q of raw as Partial<CheckinQuestion>[]) {
    const id = String(q?.id ?? "").trim();
    const label = String(q?.label ?? "").trim();
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    const type = q.type === "text" ? "text" : "rating";
    out.push({ id, type, label, short: String(q.short ?? "").trim() || label, ...(type === "rating" ? { low: String(q.low ?? "").trim() || "Poor", high: String(q.high ?? "").trim() || "Great" } : {}) });
  }
  return out.length ? out : DEFAULT_QUESTIONS;
}

export type Risk = "green" | "amber" | "red";

/** What a set of answers adds up to: the average of the ratings, which are
 *  weak (3 or less), and a colour. Red if they're unhappy with us or it's bad
 *  overall; green only if it's good overall with nothing poor. */
export function scoreCheckin(answers: CheckinAnswers, questions: CheckinQuestion[] = DEFAULT_QUESTIONS): { average: number; risk: Risk; weak: string[] } {
  const rated = questions.filter((q) => q.type === "rating" && typeof answers[q.id] === "number");
  const values = rated.map((q) => answers[q.id] as number);
  if (!values.length) return { average: 0, risk: "amber", weak: [] };
  const average = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
  const weak = rated.filter((q) => (answers[q.id] as number) <= 3).map((q) => q.id);
  const happy = typeof answers[HAPPINESS] === "number" ? (answers[HAPPINESS] as number) : null;
  const anyPoor = values.some((v) => v <= 2);
  const risk: Risk = (happy !== null && happy <= 2) || average < 2.5 ? "red" : average >= 4 && !anyPoor ? "green" : "amber";
  return { average, risk, weak };
}

/** Only for a really good check-in: every rating 4 stars or more, 4.5 on
 *  average, and 5 stars for how happy they are with us (when that's asked).
 *  Then, and only then, the form asks for a Google review. */
export function askForReview(answers: CheckinAnswers, questions: CheckinQuestion[] = DEFAULT_QUESTIONS): boolean {
  const rated = questions.filter((q) => q.type === "rating");
  if (!rated.length || rated.some((q) => typeof answers[q.id] !== "number" || (answers[q.id] as number) < 4)) return false;
  if (rated.some((q) => q.id === HAPPINESS) && answers[HAPPINESS] !== 5) return false;
  return scoreCheckin(answers, questions).average >= 4.5;
}

/** The first written answer: what they said. */
export function whatTheySaid(answers: CheckinAnswers | null, questions: CheckinQuestion[], comment?: string | null): string {
  if (comment?.trim()) return comment.trim();
  for (const q of questions) if (q.type === "text" && typeof answers?.[q.id] === "string" && (answers[q.id] as string).trim()) return (answers[q.id] as string).trim();
  return "";
}

export interface CheckinRow {
  created_at: string;
  shared_at: string | null;
  answered_at: string | null;
  expires_at: string;
}

/** Where they're up to, as plain facts: no schedule to fall behind on. */
export function checkinState<T extends CheckinRow>(rows: T[], now = new Date()) {
  const live = (r: T) => !r.answered_at && Date.parse(r.expires_at) > now.getTime();
  const sent = rows.filter((r) => r.shared_at);
  const answered = rows.filter((r) => r.answered_at);
  return {
    /** A link made but not marked as sent yet. */
    draft: rows.find((r) => live(r) && !r.shared_at) ?? null,
    /** Sent and still waiting for an answer. */
    waiting: rows.find((r) => live(r) && !!r.shared_at) ?? null,
    lastAnswered: answered[0] ?? null,
    lastSent: sent[0] ?? null,
    sentCount: sent.length,
    answeredCount: answered.filter((r) => r.shared_at).length,
  };
}

/** "today", "yesterday", "12 days ago". */
export function daysAgo(iso: string, now = new Date()): string {
  const day = (d: Date) => Math.floor((d.getTime() + 2 * 3600_000) / 864e5); // South African days
  const n = day(now) - day(new Date(iso));
  return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
}

/** The WhatsApp message with their link. */
export function checkinMessage(firstName: string, fromName: string, link: string): string {
  const hi = firstName ? `Hi ${firstName}` : "Hi";
  const from = fromName ? `, it's ${fromName} from EstateKit` : " from EstateKit";
  return `${hi}${from}. Quick check-in: it takes a minute, just tap the stars, no typing needed.\n${link}`;
}
