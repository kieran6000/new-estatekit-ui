import { DEAD_STAGES, PARKED_STAGES, PIPELINE_STAGES, stageLabel, type LeadRow, type OutcomeStep, type Pipeline, type PipelineKind, type Stage, type StageChangeExtra } from "../types";

/** Stages whose outcome needs more input — picking them (from any stage-change
 * entry point) should open the matching OutcomeSheet step instead of applying
 * silently. Stages absent from this map (No Answer, Lost, Invalid Number, New
 * Lead) have a fully-determined SOP patch and apply immediately. Buyer-pipeline
 * stages reuse the same three sub-steps as their seller equivalents. */
export const STEP_FOR_STAGE: Partial<Record<Stage, OutcomeStep>> = {
  Booked: "booked",
  Contacted: "reminder",
  "Mandate Signed": "commission",
  "Viewing Booked": "booked",
  "Offer Made": "reminder",
  Bought: "commission",
  // Agency sales: a booked call asks for the time; the follow-up-ish stages
  // ask when to follow up next. No commission step (handled per-kind below).
  "Call booked": "booked",
  Showed: "reminder",
  "Proposal sent": "reminder",
  "Renewal due": "reminder",
};

/**
 * The follow-up step for a stage, in the context of a pipeline kind.
 *
 * A "general" pipeline reuses the seller stages, so without this a recruitment
 * lead reaching "Signed up" would be asked for a commission amount — a
 * meaningless question about a job applicant. Everything else is identical.
 */
export function stepForStage(stage: Stage, kind: PipelineKind): OutcomeStep | undefined {
  const step = STEP_FOR_STAGE[stage];
  if (kind === "general" && step === "commission") return undefined;
  return step;
}

export interface MainOutcomeOption {
  icon: "event" | "chat" | "no_answer" | "premium" | "offer" | "block" | "not_owner" | "wrong_number";
  label: string;
  stage: Stage;
  /** Why a lead is lost, kept with it ("Not the owner"). Options without one
   *  are told apart by stage alone. */
  reason?: string;
}

/**
 * A seller lead who turned out not to own the property. By law (POPIA) the
 * agent can't discuss it with them, so the lead is lost, and why is kept.
 *
 * It's stored as the stage "Lost" on purpose: everything that knows Lost
 * (automations stopping, reminders, the calendar, reports) treats it the same
 * with nothing else to change. A dead lead has no next step, so next_label
 * (always "—" for one) holds the reason instead.
 */
export const NOT_OWNER = "Not the owner";
const LOST_REASONS: readonly string[] = [NOT_OWNER];

/** The "how did it go?" option list on OutcomeSheet's main step, per pipeline
 * kind — this is the one place seller vs. buyer wording/targets differ. */
export const MAIN_OUTCOME_OPTIONS: Record<PipelineKind, MainOutcomeOption[]> = {
  seller: [
    { icon: "event", label: "Booked an appointment", stage: "Booked" },
    { icon: "chat", label: "Spoke — following up", stage: "Contacted" },
    { icon: "no_answer", label: "No answer", stage: "No Answer" },
    { icon: "premium", label: "Signed the mandate", stage: "Mandate Signed" },
    { icon: "block", label: "Not selling", stage: "Lost" },
    { icon: "not_owner", label: NOT_OWNER, stage: "Lost", reason: NOT_OWNER },
    { icon: "wrong_number", label: "Wrong number", stage: "Invalid Number" },
  ],
  buyer: [
    { icon: "event", label: "Viewing booked", stage: "Viewing Booked" },
    { icon: "chat", label: "Spoke — following up", stage: "Contacted" },
    { icon: "no_answer", label: "No answer", stage: "No Answer" },
    { icon: "offer", label: "Made an offer", stage: "Offer Made" },
    { icon: "premium", label: "Bought", stage: "Bought" },
    { icon: "block", label: "Not buying", stage: "Lost" },
    { icon: "wrong_number", label: "Wrong number", stage: "Invalid Number" },
  ],
  // Neutral wording over the seller stages, so a recruitment (or any other)
  // pipeline gets the same call-logging flow without a word about property.
  general: [
    { icon: "event", label: "Booked a meeting", stage: "Booked" },
    { icon: "chat", label: "Spoke — following up", stage: "Contacted" },
    { icon: "no_answer", label: "No answer", stage: "No Answer" },
    { icon: "premium", label: "Signed up", stage: "Mandate Signed" },
    { icon: "block", label: "Not interested", stage: "Lost" },
    { icon: "wrong_number", label: "Wrong number", stage: "Invalid Number" },
  ],
  // EstateKit's own sales calls to prospective agents. The later lifecycle
  // (Paid, Live, Renewal, Churned) is set from the full stage menu, not this
  // quick "how did the call go?" list.
  agency: [
    { icon: "event", label: "Booked a call", stage: "Call booked" },
    { icon: "chat", label: "Showed — following up", stage: "Showed" },
    { icon: "no_answer", label: "No-show", stage: "No-show" },
    { icon: "offer", label: "Sent a proposal", stage: "Proposal sent" },
    { icon: "premium", label: "Signed them up", stage: "Signed" },
    { icon: "block", label: "Lost", stage: "Lost" },
  ],
};

/** Why a lost lead was lost, when the agent said ("Not the owner"); otherwise null. */
export function lostReason(l: Pick<LeadRow, "stage" | "next_label">): string | null {
  return l.stage === "Lost" && LOST_REASONS.includes(l.next_label) ? l.next_label : null;
}

/** What a lead's stage reads as: a lost lead's reason when it has one. */
export function leadStageLabel(l: Pick<LeadRow, "stage" | "next_label">, kind: PipelineKind): string {
  return lostReason(l) ?? stageLabel(l.stage, kind);
}

/** The "What happened?" answer a lead is on now, if any. "Not selling" and
 *  "Not the owner" are both Lost, told apart by the reason. */
export function currentOutcome(l: Pick<LeadRow, "stage" | "next_label">, kind: PipelineKind): MainOutcomeOption | undefined {
  const reason = lostReason(l);
  return MAIN_OUTCOME_OPTIONS[kind].find((o) => o.stage === l.stage && (o.reason ?? null) === reason);
}

/** A stage with its reason, for activity logs: "Lost · Not the owner". */
export function stageWithReason(stage: Stage, reason?: string | null): string {
  return stage === "Lost" && reason && LOST_REASONS.includes(reason) ? `${stage} · ${reason}` : stage;
}

/** What an outcome passes with its stage change: its reason, if it has one. */
export function outcomeExtra(o: MainOutcomeOption): StageChangeExtra | undefined {
  return o.reason ? { label: o.reason, at: null } : undefined;
}

export function pipelineKindFor(lead: Pick<LeadRow, "pipeline_id">, pipelines: Pipeline[]): PipelineKind {
  return pipelines.find((p) => p.id === lead.pipeline_id)?.kind ?? "seller";
}

/** Equivalent stages across the two pipeline kinds, paired by the follow-up
 *  question they ask (booked / reminder / commission) so the meaning survives
 *  the move. Stages both kinds share aren't listed — they map to themselves. */
const SELLER_TO_BUYER: Partial<Record<Stage, Stage>> = {
  Booked: "Viewing Booked",
  "Mandate Signed": "Bought",
};
const BUYER_TO_SELLER: Partial<Record<Stage, Stage>> = {
  "Viewing Booked": "Booked",
  Bought: "Mandate Signed",
  "Offer Made": "Contacted",
};
// Agency stages paired with their seller-equivalent, so a lead moved out of
// the agency pipeline keeps its meaning, and one moved in lands sensibly.
const AGENCY_TO_SELLER: Partial<Record<Stage, Stage>> = {
  Applied: "New Lead",
  "Call booked": "Booked",
  Showed: "Contacted",
  "No-show": "No Answer",
  "Proposal sent": "Contacted",
  Signed: "Mandate Signed",
  Paid: "Mandate Signed",
  Live: "Mandate Signed",
  "Renewal due": "Contacted",
  Churned: "Lost",
};
const SELLER_TO_AGENCY: Partial<Record<Stage, Stage>> = {
  "New Lead": "Applied",
  "No Answer": "No-show",
  Contacted: "Showed",
  Booked: "Call booked",
  "Mandate Signed": "Signed",
  "Invalid Number": "Lost",
};

/**
 * Translate a stage into the target pipeline kind, so a lead moved between
 * pipelines never lands on a stage that pipeline doesn't have (which would
 * break its filters and its "what happened?" options).
 */
export function stageForKind(stage: Stage, kind: PipelineKind): Stage {
  if (PIPELINE_STAGES[kind].includes(stage)) return stage;
  // Normalise an agency stage to its seller-equivalent first, so a move out of
  // the agency pipeline, or across it, keeps meaning.
  const base = AGENCY_TO_SELLER[stage] ?? stage;
  if (kind === "agency") {
    const mapped = SELLER_TO_AGENCY[base] ?? SELLER_TO_AGENCY[stage];
    return mapped && PIPELINE_STAGES.agency.includes(mapped) ? mapped : "Applied";
  }
  const mapped = kind === "buyer" ? SELLER_TO_BUYER[base] : base !== stage ? base : BUYER_TO_SELLER[stage];
  return mapped && PIPELINE_STAGES[kind].includes(mapped) ? mapped : "New Lead";
}

export function defaultReminderISO(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

/** Sort rank used across the app: due-today first, then everything else, parked stages, dead stages last. */
export function rank(l: Pick<LeadRow, "stage" | "due">): number {
  if (DEAD_STAGES.includes(l.stage)) return 3;
  if (PARKED_STAGES.includes(l.stage)) return 2;
  return l.due ? 0 : 1;
}

/** A new lead nobody has called yet: still on New Lead, came in within 24 hours
 *  (the NEW badge). These always come first in the lists. */
export function isNewLead(l: LeadRow, now = new Date()): boolean {
  const cameBack = !!l.came_back_at && now.getTime() - Date.parse(l.came_back_at) < 7 * 24 * HOUR;
  return (l.stage === "New Lead" || l.stage === "Applied") && now.getTime() - Date.parse(l.created_at) < 24 * HOUR && !cameBack;
}

export function sortLeadsForList(leads: LeadRow[]): LeadRow[] {
  const now = new Date();
  const when = new Map(leads.map((l) => [l.id, whenToCall(l, now)]));
  // Lost and parked leads stay at the bottom; the rest go by how soon they need a call.
  const group = (l: LeadRow) => (rank(l) <= 1 ? 0 : rank(l));
  return [...leads].sort((a, b) => {
    // New leads first, whatever else is going on (they are never Lost).
    const n = Number(!isNewLead(b, now)) - Number(!isNewLead(a, now));
    if (n !== 0) return n;
    const r = group(a) - group(b);
    if (r !== 0) return r;
    const w = compareWhenToCall(when.get(a.id)!, when.get(b.id)!);
    if (w !== 0) return w;
    // Then whoever got in touch most recently: came in, or came back (filled
    // in a form again). For everyone else that's the usual newest-first.
    const at = (l: LeadRow) => (l.came_back_at && l.came_back_at > l.created_at ? l.came_back_at : l.created_at);
    return at(b).localeCompare(at(a));
  });
}

export function dueLeads(leads: LeadRow[]): LeadRow[] {
  return sortLeadsForList(leads).filter(
    (l) => l.due && !DEAD_STAGES.includes(l.stage) && !PARKED_STAGES.includes(l.stage),
  );
}

/**
 * Given a target stage + optional outcome-sheet extra data, compute the patch
 * to apply to a lead (next_label / due / reminder_at / commission). Mirrors the
 * prototype's setStage() "resolve" branch — this is the SOP encoded in code.
 */
export function computeStagePatch(
  stage: Stage,
  extra?: StageChangeExtra | number,
): Partial<Pick<LeadRow, "next_label" | "due" | "reminder_at" | "commission">> {
  // Follow-up stages: a date to come back on. Agency "Showed", "Proposal sent"
  // and "Renewal due" behave the same way.
  if (stage === "Contacted" || stage === "Offer Made" || stage === "Showed" || stage === "Proposal sent" || stage === "Renewal due") {
    const e = (extra as StageChangeExtra) || {};
    const verb = stage === "Renewal due" ? "Renewal " : "Follow up ";
    return {
      due: false,
      next_label: verb + (e.label || "in 2 days"),
      reminder_at: e.at ?? defaultReminderISO(2),
    };
  }
  if (stage === "No Answer" || stage === "No-show") {
    return { due: true, next_label: stage === "No-show" ? "Rebook today" : "Retry today", reminder_at: new Date().toISOString() };
  }
  if (stage === "Booked" || stage === "Viewing Booked" || stage === "Call booked") {
    const e = (extra as StageChangeExtra) || {};
    const fallback = stage === "Call booked" ? "Call set" : "Appt set";
    return { due: false, next_label: e.label || fallback, reminder_at: e.at ?? null };
  }
  if (stage === "Mandate Signed" || stage === "Bought") {
    const commission = typeof extra === "number" ? extra : undefined;
    return { due: false, next_label: "—", reminder_at: null, ...(commission !== undefined ? { commission } : {}) };
  }
  // Agency sale milestones: each a parked step on the way to a live client.
  if (stage === "Signed") return { due: false, next_label: "Signed — collect payment", reminder_at: null };
  if (stage === "Paid") return { due: false, next_label: "Paid — set up launch", reminder_at: null };
  if (stage === "Live") return { due: false, next_label: "—", reminder_at: null };
  if (DEAD_STAGES.includes(stage)) {
    // No next step, so it keeps why, when there's a known reason (see NOT_OWNER).
    const reason = (extra as StageChangeExtra | undefined)?.label ?? "";
    return { due: false, next_label: stage === "Lost" && LOST_REASONS.includes(reason) ? reason : "—", reminder_at: null };
  }
  if (stage === "New Lead" || stage === "Applied") {
    return { due: true, next_label: stage === "Applied" ? "New application" : "Just came in", reminder_at: null };
  }
  return {};
}

/** How soon a lead needs a call: most urgent first. */
export type CallLevel = "missed" | "now" | "today" | "later" | "none";
const LEVEL_RANK: Record<CallLevel, number> = { missed: 0, now: 1, today: 2, later: 3, none: 4 };
const HOUR = 60 * 60_000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface WhenToCall {
  level: CallLevel;
  /** The bold line: "Now", "Today", "Tomorrow, 12:00", "Missed: Fri 30 Oct, 12:00". */
  when: string;
  /** The grey line: "They picked this time", "Didn't answer, try again". */
  why: string;
  /** The time this is about, for ordering within a level. */
  at: number;
}

const clockOf = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** "Today", "Tomorrow", "Yesterday" or "Wed 4 Nov", with the time if asked. */
function dayWords(at: Date, now: Date, withTime: boolean): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(at) - start(now)) / 86_400_000);
  const day = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : `${DAYS[at.getDay()]} ${at.getDate()} ${MONTHS[at.getMonth()]}`;
  return withTime ? `${day}, ${clockOf(at)}` : day;
}

/** The stored label in plain words, without repeating the name or the time
 *  (the same lead row says those already). Display only. */
function whyWords(label: string): string {
  const t = (label || "").trim();
  if (!t || t === "—" || t === "Just came in" || t === "Call") return "";
  if (/^retry/i.test(t)) return "Didn't answer, try again";
  if (/^follow up/i.test(t)) return "Follow up";
  const named = /^call\s+[^:]+:\s*(.+)$/i.exec(t);
  const words = named ? named[1] : t;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What the leads list shows for "When to call", worked out from what's stored.
 * Red ("missed") is only for a call time the lead picked that has gone by, so
 * it stays rare. A booked lead whose date has passed is not called missed: most
 * of those happened and were never updated, so it asks how it went instead.
 */
export function whenToCall(
  l: Pick<LeadRow, "stage" | "next_label" | "created_at" | "due" | "reminder_at"> & { call_at?: string | null; appointment_at?: string | null },
  now: Date = new Date(),
): WhenToCall {
  const created = Date.parse(l.created_at);
  const none: WhenToCall = { level: "none", when: "—", why: "", at: created };
  if (DEAD_STAGES.includes(l.stage)) return none;
  const label = l.next_label || "";
  const t = now.getTime();

  // A call time they picked counts from that time, not from when they picked it.
  if (l.call_at && /they picked this time/i.test(label)) {
    const at = new Date(l.call_at);
    if (!Number.isNaN(at.getTime())) {
      const why = "They picked this time";
      const ms = at.getTime();
      if (ms > t) return { level: dayWords(at, now, false) === "Today" ? "today" : "later", when: dayWords(at, now, true), why, at: ms };
      if (t - ms < HOUR) return { level: "now", when: "Now", why: `They picked ${clockOf(at)}`, at: ms };
      return { level: "missed", when: `Missed: ${dayWords(at, now, true)}`, why, at: ms };
    }
  }

  if (l.stage === "Booked" || l.stage === "Viewing Booked" || l.stage === "Call booked") {
    const word = l.stage === "Viewing Booked" ? "Viewing" : l.stage === "Call booked" ? "Call" : "Appointment";
    const iso = l.appointment_at ?? l.reminder_at;
    const at = iso ? new Date(iso) : null;
    if (!at || Number.isNaN(at.getTime())) return { level: "later", when: "No time set", why: word, at: created };
    const ms = at.getTime();
    if (ms >= t) return { level: dayWords(at, now, false) === "Today" ? "today" : "later", when: dayWords(at, now, true), why: word, at: ms };
    return { level: "today", when: `Was ${dayWords(at, now, true)}`, why: `${word}: how did it go?`, at: ms };
  }

  // Just came in and nobody has touched it.
  const untouched = l.stage === "New Lead" && (!label || label === "Just came in" || label === "—");
  if (untouched) {
    if (t - created < HOUR) return { level: "now", when: "Now", why: "Just came in", at: created };
    return { level: "today", when: "Today", why: "Not called yet", at: created };
  }

  const reminder = l.reminder_at ? Date.parse(l.reminder_at) : NaN;
  const why = whyWords(label);
  if (Number.isFinite(reminder)) {
    // They came back within the hour: as hot as a brand new lead.
    if (/came back/i.test(label) && t - reminder < HOUR && reminder <= t) return { level: "now", when: "Now", why, at: reminder };
    if (reminder > t) return { level: dayWords(new Date(reminder), now, false) === "Today" ? "today" : "later", when: dayWords(new Date(reminder), now, false), why, at: reminder };
    return { level: "today", when: "Today", why, at: created };
  }
  if (l.due) return { level: "today", when: "Today", why, at: created };
  return why ? { level: "later", when: "No date set", why, at: created } : none;
}

/** Order for the list: most urgent level first. Upcoming dates run soonest
 *  first; everything else newest first, since the newest are likeliest to pick up. */
export function compareWhenToCall(a: WhenToCall, b: WhenToCall): number {
  const r = LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
  if (r !== 0) return r;
  return a.level === "later" ? a.at - b.at : b.at - a.at;
}

/** One number that sorts the same way as compareWhenToCall (for the table's column sort). */
export function whenToCallSortValue(w: WhenToCall): number {
  return LEVEL_RANK[w.level] * 1e14 + (w.level === "later" ? w.at : 1e13 - w.at);
}
