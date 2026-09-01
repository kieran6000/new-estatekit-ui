import { DEAD_STAGES, PARKED_STAGES, type LeadRow, type OutcomeStep, type Pipeline, type PipelineKind, type Stage, type StageChangeExtra } from "../types";

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
};

export interface MainOutcomeOption {
  icon: "event" | "chat" | "no_answer" | "premium" | "offer" | "block" | "wrong_number";
  label: string;
  stage: Stage;
}

/** The "how did it go?" option list on OutcomeSheet's main step, per pipeline
 * kind — this is the one place seller vs. buyer wording/targets differ. */
export const MAIN_OUTCOME_OPTIONS: Record<PipelineKind, MainOutcomeOption[]> = {
  seller: [
    { icon: "event", label: "Booked an appointment", stage: "Booked" },
    { icon: "chat", label: "Spoke — following up", stage: "Contacted" },
    { icon: "no_answer", label: "No answer", stage: "No Answer" },
    { icon: "premium", label: "Signed the mandate", stage: "Mandate Signed" },
    { icon: "block", label: "Not selling", stage: "Lost" },
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
};

export function pipelineKindFor(lead: Pick<LeadRow, "pipeline_id">, pipelines: Pipeline[]): PipelineKind {
  return pipelines.find((p) => p.id === lead.pipeline_id)?.kind ?? "seller";
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

export function sortLeadsForList(leads: LeadRow[]): LeadRow[] {
  return [...leads].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.due === b.due) return 0;
    return a.due ? -1 : 1;
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
  if (stage === "Contacted" || stage === "Offer Made") {
    const e = (extra as StageChangeExtra) || {};
    return {
      due: false,
      next_label: "Follow up " + (e.label || "in 2 days"),
      reminder_at: e.at ?? defaultReminderISO(2),
    };
  }
  if (stage === "No Answer") {
    return { due: true, next_label: "Retry today", reminder_at: new Date().toISOString() };
  }
  if (stage === "Booked" || stage === "Viewing Booked") {
    const e = (extra as StageChangeExtra) || {};
    return { due: false, next_label: e.label || "Appt set", reminder_at: e.at ?? null };
  }
  if (stage === "Mandate Signed" || stage === "Bought") {
    const commission = typeof extra === "number" ? extra : undefined;
    return { due: false, next_label: "—", reminder_at: null, ...(commission !== undefined ? { commission } : {}) };
  }
  if (DEAD_STAGES.includes(stage)) {
    return { due: false, next_label: "—", reminder_at: null };
  }
  if (stage === "New Lead") {
    return { due: true, next_label: "Just came in", reminder_at: null };
  }
  return {};
}
