// The workflow model behind Automations → Workflows: what a workflow is,
// every edit you can make to one, and the checks that keep a broken one from
// being switched on. No React here, so all of it is unit-tested
// (workflow.test.ts). The builder UI (components/WorkflowBuilder.tsx) only
// calls these.
//
// Kept to the 80/20 on purpose. Every trigger, step, check and stop rule
// below is one the engine (run-automations) can actually do or will do with
// the planned add-only backend; nothing is here "because GHL has it".

// ── Shape ────────────────────────────────────────────────────────────────

export type TriggerKind =
  | "lead_created" | "stage_changed" | "no_answer_times" | "not_contacted_for"
  | "reminder_due" | "plan_opened" | "daily_at";

export interface Trigger { kind: TriggerKind; stage?: string; count?: number; days?: number; time?: string }

export type Unit = "minutes" | "hours" | "days";

export type BranchCheck = "stage_is" | "has_tag" | "opened_last_email" | "has_email" | "source_is" | "pipeline_is";

export type Step =
  | { id: string; type: "wait"; amount: number; unit: Unit }
  | { id: string; type: "whatsapp_agent"; text: string }
  | { id: string; type: "email_lead"; subject: string; body: string }
  | { id: string; type: "set_stage"; stage: string }
  | { id: string; type: "reminder"; label: string; inDays: number }
  | { id: string; type: "tag"; tag: string }
  | { id: string; type: "branch"; check: BranchCheck; value: string; yes: Step[]; no: Step[] };

export type StepType = Step["type"];
export type Branch = Extract<Step, { type: "branch" }>;

export type FilterField = "pipeline" | "source" | "stage" | "has_email" | "has_tag";
export interface Filter { field: FilterField; value: string }

export type ExitKind = "booked" | "lost" | "any_stage_change";
export interface Exit { kind: ExitKind; on: boolean }

export interface Settings { quietHours: boolean; reEnter: boolean }

export interface Workflow {
  id: string;
  name: string;
  published: boolean;
  trigger: Trigger;
  filters: Filter[];
  steps: Step[];
  exits: Exit[];
  settings: Settings;
  updatedAt: string;
  /** Shown above the canvas: what's true about this workflow today. */
  note?: string;
}

// ── Vocabulary (labels live here so the canvas, panel and checks agree) ──

export const STAGES = ["New Lead", "No Answer", "Contacted", "Booked", "Viewing Booked", "Offer Made", "Mandate Signed", "Bought", "Lost", "Invalid Number"];
export const PIPELINES = ["Sellers", "Buyers"];
export const SOURCES = ["Facebook form", "EstateKit page", "Added by hand"];
/** Tags a workflow can check for or filter on. "Not ready" is set by lead
 *  pages (lib/leadTags.ts); others come from "Add tag" steps. */
export const KNOWN_TAGS = ["Not ready"];

export const TRIGGERS: { kind: TriggerKind; label: string; help: string }[] = [
  { kind: "lead_created", label: "New lead comes in", help: "From a Facebook form or an EstateKit page." },
  { kind: "stage_changed", label: "Lead moves to a stage", help: "When the agent (or a step) moves the lead to this stage." },
  { kind: "no_answer_times", label: "No answer, a number of times", help: "After the agent logs \"No answer\" this many times." },
  { kind: "not_contacted_for", label: "Lead goes quiet", help: "No call or stage change for this many days." },
  { kind: "reminder_due", label: "A follow-up reminder is due", help: "When a reminder's time arrives." },
  { kind: "plan_opened", label: "Lead opens their Marketing Plan", help: "The plan link in the confirmation email." },
  { kind: "daily_at", label: "Every weekday at a set time", help: "Once per agent, not per lead: for a daily summary on WhatsApp." },
];

export const STEP_TYPES: { type: StepType; label: string; help: string }[] = [
  { type: "wait", label: "Wait", help: "Pause before the next step" },
  { type: "whatsapp_agent", label: "WhatsApp the agent", help: "A nudge about this lead, with the call link" },
  { type: "email_lead", label: "Email the lead", help: "From the agent's name; replies go to the agent" },
  { type: "branch", label: "If / else", help: "Two paths, on a yes/no check" },
  { type: "set_stage", label: "Move stage", help: "Change the lead's stage" },
  { type: "reminder", label: "Set reminder", help: "Puts a follow-up on the agent's list" },
  { type: "tag", label: "Add tag", help: "Label the lead (staff see tags)" },
];

export const BRANCH_CHECKS: { check: BranchCheck; label: string; needsValue: boolean }[] = [
  { check: "stage_is", label: "Lead's stage is", needsValue: true },
  { check: "has_tag", label: "Lead has the tag", needsValue: true },
  { check: "opened_last_email", label: "Opened the last email", needsValue: false },
  { check: "has_email", label: "Lead has an email address", needsValue: false },
  { check: "source_is", label: "Lead came from", needsValue: true },
  { check: "pipeline_is", label: "Lead's pipeline is", needsValue: true },
];

export const FILTER_FIELDS: { field: FilterField; label: string; options: () => { v: string; l: string }[] }[] = [
  { field: "pipeline", label: "Pipeline", options: () => PIPELINES.map((v) => ({ v, l: v })) },
  { field: "source", label: "Source", options: () => SOURCES.map((v) => ({ v, l: v })) },
  { field: "stage", label: "Stage", options: () => STAGES.map((v) => ({ v, l: v })) },
  { field: "has_email", label: "Email", options: () => [{ v: "yes", l: "Has an email" }, { v: "no", l: "No email" }] },
  { field: "has_tag", label: "Tag", options: () => KNOWN_TAGS.map((v) => ({ v, l: v })) },
];

export const EXITS: { kind: ExitKind; label: string }[] = [
  { kind: "booked", label: "The lead books or signs (Booked, Viewing, Offer, Mandate, Bought)" },
  { kind: "lost", label: "The lead is marked Lost or Invalid Number" },
  { kind: "any_stage_change", label: "The lead's stage changes at all" },
];

/** Merge fields per message, exactly the ones the senders fill in today
 *  (run-automations, daily-stage-nudge, send-lead-confirmation).
 *  {{action_link}} is the agent's call link: never in an email to the lead.
 *  In a daily summary there's no lead: {{first_name}} is the agent's. */
export const FIELDS = {
  whatsapp_agent: ["first_name", "name", "stage", "next_label", "action_link"],
  daily: ["first_name", "count", "leads_word"],
  email_lead: ["first_name", "area", "address", "agent_name", "agent_phone", "plan_link"],
} as const;
export type FieldSet = keyof typeof FIELDS;

/** The fields a step's message can use under this trigger. */
export function fieldsFor(step: "whatsapp_agent" | "email_lead", t: Trigger): readonly string[] {
  return step === "email_lead" ? FIELDS.email_lead : t.kind === "daily_at" ? FIELDS.daily : FIELDS.whatsapp_agent;
}

// ── Creating ─────────────────────────────────────────────────────────────

let seq = 0;
export const newId = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

export const allExits = (on: boolean): Exit[] => EXITS.map((e) => ({ kind: e.kind, on }));
export const defaultSettings = (): Settings => ({ quietHours: true, reEnter: false });

export function newStep(type: StepType): Step {
  const id = newId();
  switch (type) {
    case "wait": return { id, type, amount: 1, unit: "days" };
    case "whatsapp_agent": return { id, type, text: "" };
    case "email_lead": return { id, type, subject: "", body: "" };
    case "set_stage": return { id, type, stage: "Contacted" };
    case "reminder": return { id, type, label: "Follow up", inDays: 1 };
    case "tag": return { id, type, tag: "" };
    case "branch": return { id, type, check: "has_email", value: "", yes: [], no: [] };
  }
}

/** A trigger of a new kind, with sensible values filled in (never blank). */
export function triggerOfKind(kind: TriggerKind): Trigger {
  switch (kind) {
    case "stage_changed": return { kind, stage: "No Answer" };
    case "no_answer_times": return { kind, count: 2 };
    case "not_contacted_for": return { kind, days: 14 };
    case "daily_at": return { kind, time: "16:00" };
    default: return { kind };
  }
}

/** The value a branch check starts with when picked. */
export function defaultBranchValue(check: BranchCheck): string {
  switch (check) {
    case "stage_is": return "New Lead";
    case "has_tag": return KNOWN_TAGS[0];
    case "source_is": return SOURCES[0];
    case "pipeline_is": return PIPELINES[0];
    default: return "";
  }
}

export function blankWorkflow(): Workflow {
  return { id: newId(), name: "Untitled workflow", published: false, updatedAt: new Date().toISOString(), trigger: { kind: "lead_created" }, filters: [], steps: [], exits: allExits(true), settings: defaultSettings() };
}

/** A deep copy with fresh ids, so the copy never shares a node with the original. */
export function cloneSteps(steps: Step[]): Step[] {
  return steps.map((s) => (s.type === "branch" ? { ...s, id: newId(), yes: cloneSteps(s.yes), no: cloneSteps(s.no) } : { ...s, id: newId() }));
}

// ── Tree edits (all pure: they return a new tree) ───────────────────────

/** Where a list of steps lives: the main path, or one side of a branch. */
export type Path = "root" | `${string}:yes` | `${string}:no`;

export function mapSteps(steps: Step[], fn: (s: Step) => Step | null): Step[] {
  const out: Step[] = [];
  for (const s of steps) {
    const r = fn(s);
    if (!r) continue;
    out.push(r.type === "branch" ? { ...r, yes: mapSteps(r.yes, fn), no: mapSteps(r.no, fn) } : r);
  }
  return out;
}

export function findStep(steps: Step[], id: string): Step | undefined {
  for (const s of steps) {
    if (s.id === id) return s;
    if (s.type === "branch") {
      const f = findStep(s.yes, id) ?? findStep(s.no, id);
      if (f) return f;
    }
  }
  return undefined;
}

/** Insert `step` at `index` in the list at `path`. Out-of-range indexes clamp. */
export function insertStep(steps: Step[], path: Path, index: number, step: Step): Step[] {
  if (path === "root") {
    const i = Math.max(0, Math.min(index, steps.length));
    return [...steps.slice(0, i), step, ...steps.slice(i)];
  }
  const [bid, side] = path.split(":") as [string, "yes" | "no"];
  return steps.map((s) => {
    if (s.type !== "branch") return s;
    if (s.id === bid) {
      const list = s[side];
      const i = Math.max(0, Math.min(index, list.length));
      return { ...s, [side]: [...list.slice(0, i), step, ...list.slice(i)] };
    }
    return { ...s, yes: insertStep(s.yes, path, index, step), no: insertStep(s.no, path, index, step) };
  });
}

/** Removes a step (and, for a branch, both its paths). */
export function removeStep(steps: Step[], id: string): Step[] {
  return mapSteps(steps, (s) => (s.id === id ? null : s));
}

/** Changes one step's fields. The id and type can't be changed this way. */
export function updateStep(steps: Step[], id: string, patch: Partial<Step>): Step[] {
  const { id: _id, type: _type, ...safe } = patch as Partial<Step> & { id?: string; type?: string };
  return mapSteps(steps, (s) => (s.id === id ? ({ ...s, ...safe } as Step) : s));
}

/** Moves a step up or down within its own list. No-op at either end. */
export function moveStep(steps: Step[], id: string, dir: -1 | 1): Step[] {
  const i = steps.findIndex((s) => s.id === id);
  if (i >= 0) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return steps;
    const out = [...steps];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  }
  return steps.map((s) => (s.type === "branch" ? { ...s, yes: moveStep(s.yes, id, dir), no: moveStep(s.no, id, dir) } : s));
}

/** The step's position: which list it's in, its index there, and the list's length. */
export function locate(steps: Step[], id: string, path: Path = "root"): { path: Path; index: number; length: number } | null {
  const i = steps.findIndex((s) => s.id === id);
  if (i >= 0) return { path, index: i, length: steps.length };
  for (const s of steps) {
    if (s.type !== "branch") continue;
    const f = locate(s.yes, id, `${s.id}:yes`) ?? locate(s.no, id, `${s.id}:no`);
    if (f) return f;
  }
  return null;
}

export function countSteps(steps: Step[]): number {
  return steps.reduce((n, s) => n + 1 + (s.type === "branch" ? countSteps(s.yes) + countSteps(s.no) : 0), 0);
}

// ── Words ────────────────────────────────────────────────────────────────

export const unitLabel = (n: number, u: Unit) => `${n} ${n === 1 ? u.replace(/s$/, "") : u}`;
export const waitMinutes = (s: { amount: number; unit: Unit }) => s.amount * (s.unit === "minutes" ? 1 : s.unit === "hours" ? 60 : 1440);

export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export function triggerSummary(t: Trigger): string {
  switch (t.kind) {
    case "stage_changed": return `Lead moves to ${t.stage || "…"}`;
    case "no_answer_times": return `No answer ${t.count ?? 1} time${(t.count ?? 1) === 1 ? "" : "s"}`;
    case "not_contacted_for": return `Quiet for ${t.days ?? 14} day${(t.days ?? 14) === 1 ? "" : "s"}`;
    case "daily_at": return `Every weekday at ${t.time || "16:00"}`;
    default: return TRIGGERS.find((x) => x.kind === t.kind)?.label ?? t.kind;
  }
}

export const branchLabel = (c: BranchCheck) => BRANCH_CHECKS.find((x) => x.check === c)?.label ?? c;

export function stepSummary(s: Step): string {
  switch (s.type) {
    case "wait": return `Wait ${unitLabel(s.amount, s.unit)}`;
    case "whatsapp_agent": return s.text.split("\n")[0] || "No message yet";
    case "email_lead": return s.subject || "No subject yet";
    case "set_stage": return `Move to ${s.stage || "…"}`;
    case "reminder": return `${s.label || "Reminder"} · ${s.inDays === 0 ? "due today" : `in ${unitLabel(s.inDays, "days")}`}`;
    case "tag": return s.tag ? `Tag "${s.tag}"` : "No tag yet";
    case "branch": {
      const needs = BRANCH_CHECKS.find((x) => x.check === s.check)?.needsValue;
      return `${branchLabel(s.check)}${needs ? ` ${s.value || "…"}` : ""}?`;
    }
  }
}

export const stepTitle = (s: Step | { type: StepType }) => STEP_TYPES.find((x) => x.type === s.type)?.label ?? s.type;

export function filterSummary(f: Filter): string {
  if (f.field === "has_email") return f.value === "no" ? "Has no email" : "Has an email";
  if (f.field === "has_tag") return `Tagged ${f.value || "…"}`;
  return `${FILTER_FIELDS.find((x) => x.field === f.field)?.label}: ${f.value || "…"}`;
}

/** Messages and waits on the main path, in time, for "How this plays out". */
export function timeline(wf: Workflow): { atMinutes: number; what: string }[] {
  let mins = 0;
  const out: { atMinutes: number; what: string }[] = [];
  for (const s of wf.steps) {
    if (s.type === "wait") { mins += waitMinutes(s); continue; }
    out.push({ atMinutes: mins, what: s.type === "branch" ? `Check: ${stepSummary(s)}` : `${stepTitle(s)}: ${stepSummary(s)}` });
  }
  return out;
}

export function timeLabel(m: number): string {
  if (m === 0) return "Straight away";
  if (m < 60) return `+${m} min`;
  if (m < 1440) return `+${+(m / 60).toFixed(1)} h`;
  return `Day ${+(m / 1440).toFixed(1)}`;
}

// ── Checks: a workflow with problems can't be switched on ───────────────

/** Steps the trigger can run. A daily summary isn't about one lead, so it can
 *  only wait and WhatsApp the agent. */
export function allowedSteps(t: Trigger): StepType[] {
  return t.kind === "daily_at" ? ["wait", "whatsapp_agent"] : STEP_TYPES.map((x) => x.type);
}

/** Every problem, keyed by what it's on: a step id, "trigger", "filters" or "workflow". */
export type Problems = Record<string, string[]>;

const FIELD_RE = /\{\{\s*(\w+)\s*\}\}/g;

function fieldProblems(text: string, kind: "whatsapp_agent" | "email_lead", t: Trigger): string[] {
  const out: string[] = [];
  const allowed = fieldsFor(kind, t);
  for (const [, f] of text.matchAll(FIELD_RE)) {
    if (allowed.includes(f)) continue;
    if (f === "action_link" && kind === "email_lead") out.push("{{action_link}} is the agent's call link. Don't send it to the lead.");
    else if (t.kind === "daily_at" && kind === "whatsapp_agent") out.push(`{{${f}}} doesn't work in a daily summary: it isn't about one lead. Use {{first_name}}, {{count}} or {{leads_word}}.`);
    else if (f === "phone") out.push("{{phone}} isn't available: agents tap the number instead of the call link, so the call isn't logged.");
    else out.push(`{{${f}}} isn't a field. Use the field buttons below the box.`);
  }
  return [...new Set(out)];
}

export function validate(wf: Workflow): Problems {
  const p: Problems = {};
  const add = (key: string, msg: string) => { (p[key] ??= []).push(msg); };
  const t = wf.trigger;

  if (!wf.name.trim()) add("workflow", "Give the workflow a name.");
  if (t.kind === "stage_changed" && !t.stage) add("trigger", "Pick the stage.");
  if (t.kind === "no_answer_times" && !(Number.isInteger(t.count) && (t.count ?? 0) >= 1)) add("trigger", "Missed calls must be a whole number, 1 or more.");
  if (t.kind === "not_contacted_for" && !(Number.isInteger(t.days) && (t.days ?? 0) >= 1)) add("trigger", "Days must be a whole number, 1 or more.");
  if (t.kind === "daily_at" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time ?? "")) add("trigger", "Pick a time.");

  const seen = new Set<string>();
  for (const f of wf.filters) {
    if (!f.value) add("filters", `Pick a value for ${FILTER_FIELDS.find((x) => x.field === f.field)?.label}.`);
    if (seen.has(f.field)) add("filters", `${FILTER_FIELDS.find((x) => x.field === f.field)?.label} is there twice. Keep one.`);
    seen.add(f.field);
  }

  const allowed = allowedSteps(t);
  let actions = 0;
  // Returns whether an email has certainly gone out by the end of `steps`
  // (inside a branch, only if both paths send one).
  const walk = (steps: Step[], emailBefore: boolean): boolean => {
    let hadEmail = emailBefore;
    steps.forEach((s, i) => {
      if (!allowed.includes(s.type)) add(s.id, `"${stepTitle(s)}" can't run on "${triggerSummary(t)}": that trigger isn't about one lead.`);
      switch (s.type) {
        case "wait":
          if (!Number.isInteger(s.amount) || s.amount < 1) add(s.id, "Wait at least 1 (whole number).");
          if (s.unit === "minutes" && s.amount > 0 && s.amount < 5) add(s.id, "Waits shorter than 5 minutes aren't reliable: messages go out once a minute in small batches.");
          if (i === steps.length - 1) add(s.id, "Nothing happens after this wait. Add a step after it or delete it.");
          break;
        case "whatsapp_agent":
          actions++;
          if (!s.text.trim()) add(s.id, "Write the message.");
          for (const m of fieldProblems(s.text, "whatsapp_agent", t)) add(s.id, m);
          break;
        case "email_lead":
          actions++;
          hadEmail = true;
          if (!s.subject.trim()) add(s.id, "Write a subject.");
          if (!s.body.trim()) add(s.id, "Write the email.");
          for (const m of fieldProblems(`${s.subject}\n${s.body}`, "email_lead", t)) add(s.id, m);
          break;
        case "set_stage":
          actions++;
          if (!STAGES.includes(s.stage)) add(s.id, "Pick a stage.");
          if (t.kind === "stage_changed" && t.stage === s.stage) add(s.id, `The lead is already ${s.stage}: this trigger just moved them there.`);
          break;
        case "reminder":
          actions++;
          if (!s.label.trim()) add(s.id, "Say what the reminder is for.");
          if (!Number.isInteger(s.inDays) || s.inDays < 0) add(s.id, "Due in must be a whole number of days, 0 for today.");
          break;
        case "tag":
          actions++;
          if (!s.tag.trim()) add(s.id, "Type the tag.");
          break;
        case "branch": {
          const meta = BRANCH_CHECKS.find((x) => x.check === s.check);
          if (meta?.needsValue && !s.value) add(s.id, "Pick what to check for.");
          if (s.check === "opened_last_email" && !hadEmail) add(s.id, "There's no email before this check. Add an \"Email the lead\" step above it.");
          if (!s.yes.length && !s.no.length) add(s.id, "Both paths are empty. Add a step under Yes or No, or delete the check.");
          const y = walk(s.yes, hadEmail);
          const n = walk(s.no, hadEmail);
          hadEmail = y && n;
          break;
        }
      }
    });
    return hadEmail;
  };
  walk(wf.steps, false);
  if (actions === 0) add("workflow", "Add a step that does something: a WhatsApp, an email, a stage, a reminder or a tag.");
  return p;
}

export const problemCount = (p: Problems) => Object.values(p).reduce((n, l) => n + l.length, 0);

// ── Today's automations, drawn as workflows ─────────────────────────────

export interface AutomationLike { id: string; name: string; enabled: boolean; trigger_type: string; trigger_stage: string | null; created_at: string }
export interface AutomationStepLike { step_order: number; delay_minutes: number; action_type: string; template_text: string | null; payload: Record<string, unknown> | null }

/** Minutes → the friendliest whole unit ("2 days", not "2880 minutes"). */
export function waitFrom(minutes: number): Step {
  if (minutes % 1440 === 0) return { id: newId(), type: "wait", amount: minutes / 1440, unit: "days" };
  if (minutes % 60 === 0) return { id: newId(), type: "wait", amount: minutes / 60, unit: "hours" };
  return { id: newId(), type: "wait", amount: minutes, unit: "minutes" };
}

export function fromAutomation(a: AutomationLike, steps: AutomationStepLike[]): Workflow {
  const out: Step[] = [];
  for (const s of [...steps].sort((x, y) => x.step_order - y.step_order)) {
    if (s.delay_minutes > 0 && a.trigger_type !== "daily_digest") out.push(waitFrom(s.delay_minutes));
    if (s.action_type === "send_whatsapp") out.push({ id: newId(), type: "whatsapp_agent", text: s.template_text ?? "" });
    else if (s.action_type === "set_stage") out.push({ id: newId(), type: "set_stage", stage: String(s.payload?.stage ?? "") });
    else if (s.action_type === "set_reminder") {
      const p = (s.payload ?? {}) as { label?: string; offset_minutes?: number };
      out.push({ id: newId(), type: "reminder", label: p.label ?? "Follow up", inDays: Math.round((p.offset_minutes ?? 0) / 1440) });
    }
  }
  const trigger: Trigger =
    a.trigger_type === "stage_changed" ? { kind: "stage_changed", stage: a.trigger_stage ?? undefined }
      : a.trigger_type === "daily_digest" ? { kind: "daily_at", time: "16:00" }
        : a.trigger_type === "reminder_due" ? { kind: "reminder_due" }
          : { kind: "lead_created" };
  const multiStep = out.filter((s) => s.type !== "wait").length > 1 || out[0]?.type === "wait";
  return {
    id: a.id,
    name: a.name.replace(/â€”/g, "—"),
    published: a.enabled,
    trigger,
    filters: [],
    steps: out,
    // The engine today never ends a run early (run-automations has no stage
    // check), so converted workflows start with every stop rule off.
    exits: allExits(false),
    settings: { ...defaultSettings(), quietHours: a.trigger_type !== "lead_created" },
    updatedAt: a.created_at,
    note: multiStep && trigger.kind === "stage_changed"
      ? "Today nothing stops this early: a lead who books after this starts still gets the later nudges. Turn on the stop rules to fix that."
      : undefined,
  };
}

/** send-lead-confirmation, drawn as a workflow: one email per pipeline. */
export function confirmationEmail(): Workflow {
  const sign = "\n\n{{agent_name}}\n{{agent_phone}}";
  return {
    id: "confirmation-email",
    name: "Lead confirmation email",
    published: true,
    trigger: { kind: "lead_created" },
    filters: [{ field: "has_email", value: "yes" }],
    exits: allExits(false),
    settings: { ...defaultSettings(), quietHours: false },
    updatedAt: "2026-09-27T10:00:00Z",
    note: "Only for lead pages with the confirmation email switched on (Forms → the page → Email).",
    steps: [
      {
        id: newId(), type: "branch", check: "pipeline_is", value: "Sellers",
        yes: [{ id: newId(), type: "email_lead", subject: "Your {{area}} home evaluation request", body: "Hi {{first_name}},\n\nThanks for requesting a free home evaluation for {{address}}.\n\nI'm having a look at what's sold near you recently. I'll be in touch shortly to go through what your home could be worth, and whether I have buyers looking in the area.\n\nWhile you wait, here's how I'd sell your home: {{plan_link}}" + sign }],
        no: [{ id: newId(), type: "email_lead", subject: "We've received your details", body: "Hi {{first_name}},\n\nThanks for getting in touch.\n\nI've received your details and I'll be in touch shortly." + sign }],
      },
    ],
  };
}

// ── Templates ────────────────────────────────────────────────────────────

export const TEMPLATES: { name: string; blurb: string; make: () => Workflow }[] = [
  {
    name: "No answer → email follow-up",
    blurb: "Two missed calls, then two emails over a week. Stops when they book or are marked lost.",
    make: () => ({
      ...blankWorkflow(), name: "No answer → email follow-up",
      trigger: { kind: "no_answer_times", count: 2 },
      filters: [{ field: "has_email", value: "yes" }],
      steps: [
        { id: newId(), type: "wait", amount: 30, unit: "minutes" },
        { id: newId(), type: "email_lead", subject: "Sorry I missed you, {{first_name}}", body: "Hi {{first_name}},\n\nI tried calling about your home in {{area}}. When's a good time for a quick 5-minute chat?\n\n{{agent_name}}\n{{agent_phone}}" },
        { id: newId(), type: "wait", amount: 2, unit: "days" },
        {
          id: newId(), type: "branch", check: "opened_last_email", value: "",
          yes: [{ id: newId(), type: "whatsapp_agent", text: "{{first_name}} opened your email. Good moment to call: {{action_link}}" }],
          no: [{ id: newId(), type: "email_lead", subject: "What is your home worth right now?", body: "Hi {{first_name}},\n\nHomes like yours in {{area}} have been selling. I'd be happy to give you a free, no-obligation valuation.\n\n{{agent_name}}\n{{agent_phone}}" }],
        },
        { id: newId(), type: "wait", amount: 4, unit: "days" },
        { id: newId(), type: "reminder", label: "Last try: call", inDays: 0 },
      ],
    }),
  },
  {
    name: "New lead: speed to lead",
    blurb: "Alert the agent straight away, and again after 10 minutes if the lead is still new.",
    make: () => ({
      ...blankWorkflow(), name: "New lead: speed to lead",
      settings: { ...defaultSettings(), quietHours: false },
      steps: [
        { id: newId(), type: "whatsapp_agent", text: "New lead: {{name}}. Tap to contact: {{action_link}}" },
        { id: newId(), type: "wait", amount: 10, unit: "minutes" },
        { id: newId(), type: "branch", check: "stage_is", value: "New Lead", yes: [{ id: newId(), type: "whatsapp_agent", text: "{{first_name}} is still waiting for your call: {{action_link}}" }], no: [] },
      ],
    }),
  },
  {
    name: "Not ready: stay in touch",
    blurb: "Leads tagged Not ready get a friendly email after 2 weeks and a reminder for the agent.",
    make: () => ({
      ...blankWorkflow(), name: "Not ready: stay in touch",
      filters: [{ field: "has_tag", value: "Not ready" }, { field: "has_email", value: "yes" }],
      steps: [
        { id: newId(), type: "wait", amount: 14, unit: "days" },
        { id: newId(), type: "email_lead", subject: "Still thinking about selling, {{first_name}}?", body: "Hi {{first_name}},\n\nJust checking in. Whenever you're ready, I'm happy to give you an up-to-date valuation for your home in {{area}}.\n\n{{agent_name}}\n{{agent_phone}}" },
        { id: newId(), type: "reminder", label: "Check in with {{first_name}}", inDays: 3 },
      ],
    }),
  },
  {
    name: "Blank workflow",
    blurb: "Pick your own trigger and steps.",
    make: blankWorkflow,
  },
];
