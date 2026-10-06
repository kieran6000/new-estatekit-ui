import { PIPELINE_STAGES, stageLabel, type PipelineKind, type Stage } from "../types";

// The workflow model behind Automations → Workflows: what a workflow is,
// every edit you can make to one, and the checks that keep a broken one from
// being switched on. No React here, so all of it is unit-tested
// (workflow.test.ts). The builder UI (components/WorkflowBuilder.tsx) only
// calls these.
//
// Kept to the 80/20 on purpose. Every trigger, step, check and stop rule
// below is one the engine (supabase/functions/run-automations/workflows.ts)
// runs; nothing is here "because GHL has it". Change both together.

// ── Shape ────────────────────────────────────────────────────────────────

export type TriggerKind =
  | "lead_created" | "stage_changed" | "no_answer_times" | "not_contacted_for"
  | "reminder_due" | "plan_opened" | "daily_at" | "appointment";

export type Unit = "minutes" | "hours" | "days";

/** `amount`/`unit`/`when` are for "appointment": e.g. 1 hour before. */
export interface Trigger { kind: TriggerKind; stage?: string; count?: number; days?: number; time?: string; amount?: number; unit?: Unit; when?: "before" | "after" }

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
  /** Templates only: new accounts get a copy, switched on or off ("no": they don't). */
  standard?: "no" | "on" | "off";
}

// ── Vocabulary (labels live here so the canvas, panel and checks agree) ──

export const STAGES = ["New Lead", "No Answer", "Contacted", "Booked", "Viewing Booked", "Offer Made", "Mandate Signed", "Bought", "Lost", "Invalid Number"];
/** Pipeline values that mean "any pipeline of this kind". Templates use these
 *  (they're copied to every account); an account's own workflows pick its
 *  pipelines by id ("id:<uuid>"). KEEP IN STEP with pipelineIs in
 *  run-automations/workflows.ts. */
export const PIPELINES = ["Sellers", "Buyers", "General"];
const PIPELINE_KIND_VALUE: Record<string, { kind: PipelineKind; label: string }> = {
  Sellers: { kind: "seller", label: "Any seller pipeline" },
  Buyers: { kind: "buyer", label: "Any buyer pipeline" },
  General: { kind: "general", label: "Any other pipeline" },
};
/** Where a lead came from. An account's workflows can also pick one of its
 *  forms ("page:<uuid>"). KEEP IN STEP with source matching in workflows.ts. */
export const SOURCES = ["Facebook form", "EstateKit page", "Added by hand"];

// ── This account's own pipelines, forms and tags ─────────────────────────
// Set by the builder for the account being edited; null for templates, which
// stay generic. Every pick list, summary and check below reads from here.

export interface AccountVocab {
  pipelines: { id: string; name: string; kind: PipelineKind }[];
  forms: { id: string; name: string }[];
  tags: string[];
}
let vocab: AccountVocab | null = null;
export function setAccountVocab(v: AccountVocab | null): void {
  vocab = v;
  if (v) rememberTags(v.tags);
}
export const accountVocab = () => vocab;

export type OptionKind = "pipeline" | "source" | "stage" | "tag";
export interface Option { v: string; l: string }

/** The stages this account's pipelines use, in the usual order. A stage a
 *  recruitment ("general") pipeline renames shows both names. */
function stageOptions(): Option[] {
  if (!vocab || !vocab.pipelines.length) return STAGES.map((v) => ({ v, l: v }));
  const kinds = new Set(vocab.pipelines.map((p) => p.kind));
  const used = new Set([...kinds].flatMap((k) => PIPELINE_STAGES[k]));
  return STAGES.filter((s) => used.has(s as Stage)).map((v) => ({ v, l: stageName(v) }));
}

function stageName(v: string): string {
  if (!vocab) return v;
  const kinds = [...new Set(vocab.pipelines.map((p) => p.kind))];
  const names = [...new Set(kinds.filter((k) => PIPELINE_STAGES[k].includes(v as Stage)).map((k) => stageLabel(v as Stage, k)))];
  return names.length ? names.join(" / ") : v;
}

/** What a picked value reads as, e.g. "id:…" → the pipeline's name. */
export function valueLabel(kind: OptionKind, v: string): string {
  if (!v) return "…";
  if (kind === "pipeline") {
    if (v.startsWith("id:")) return vocab?.pipelines.find((p) => `id:${p.id}` === v)?.name ?? "a deleted pipeline";
    return PIPELINE_KIND_VALUE[v]?.label ?? v;
  }
  if (kind === "source" && v.startsWith("page:")) {
    const f = vocab?.forms.find((x) => `page:${x.id}` === v);
    return f ? `Form: ${f.name}` : "a deleted form";
  }
  if (kind === "stage") return stageName(v);
  return v;
}

/** The choices for a pick list. The current value is kept even when it's no
 *  longer offered (a deleted pipeline, an old "Sellers"), so nothing changes
 *  silently; the checks flag it instead. */
export function optionsFor(kind: OptionKind, current?: string): Option[] {
  let opts: Option[];
  if (kind === "pipeline") {
    opts = vocab
      ? vocab.pipelines.map((p) => ({ v: `id:${p.id}`, l: p.name }))
      : PIPELINES.map((v) => ({ v, l: PIPELINE_KIND_VALUE[v].label }));
  } else if (kind === "source") {
    opts = SOURCES.map((v) => ({ v, l: v }));
    if (vocab) opts = opts.concat(vocab.forms.map((f) => ({ v: `page:${f.id}`, l: `Form: ${f.name}` })));
  } else if (kind === "stage") {
    opts = stageOptions();
  } else {
    opts = KNOWN_TAGS.map((v) => ({ v, l: v }));
  }
  if (current && !opts.some((o) => o.v === current)) opts = [...opts, { v: current, l: valueLabel(kind, current) }];
  return opts;
}

/** Why a picked value won't work for this account, if it won't: only a
 *  pipeline or form that was deleted. A kind or stage the account doesn't use
 *  yet isn't a problem: every account gets the same standard workflows (the
 *  buyer ones too), and those just never fire until it has that pipeline. */
export function valueProblem(kind: OptionKind, v: string): string | null {
  if (!vocab || !v) return null;
  if (kind === "pipeline" && v.startsWith("id:") && !vocab.pipelines.some((p) => `id:${p.id}` === v)) return "That pipeline was deleted. Pick another.";
  if (kind === "source" && v.startsWith("page:") && !vocab.forms.some((f) => `page:${f.id}` === v)) return "That form was deleted. Pick another.";
  return null;
}

/** Tags a workflow can check for or filter on. "Not tracked" is
 *  worked out from the lead page (lib/leadTags.ts); the rest are the ones
 *  "Add tag" steps add (rememberTags fills them in as workflows load). */
export const KNOWN_TAGS: string[] = ["Not tracked"];

/** Every tag the "Add tag" steps in this tree add. */
export function tagsIn(steps: Step[]): string[] {
  const out: string[] = [];
  const walk = (l: Step[]) => l.forEach((s) => { if (s.type === "tag" && s.tag.trim()) out.push(s.tag.trim()); if (s.type === "branch") { walk(s.yes); walk(s.no); } });
  walk(steps);
  return out;
}

/** Adds tags to the pick lists (case-insensitive, no duplicates). */
export function rememberTags(tags: string[]): void {
  for (const t of tags) if (!KNOWN_TAGS.some((k) => k.toLowerCase() === t.toLowerCase())) KNOWN_TAGS.push(t);
}

export const TRIGGERS: { kind: TriggerKind; label: string; help: string }[] = [
  { kind: "lead_created", label: "New lead comes in", help: "From a Facebook form or an EstateKit page." },
  { kind: "stage_changed", label: "Lead moves to a stage", help: "When the agent (or a step) moves the lead to this stage." },
  { kind: "no_answer_times", label: "No answer, a number of times", help: "After the agent logs \"No answer\" this many times." },
  { kind: "not_contacted_for", label: "Lead goes quiet", help: "No call or stage change for this many days." },
  { kind: "appointment", label: "Before or after an appointment", help: "A set time before (or after) a Booked or Viewing Booked appointment: 1 day, 1 hour, 30 minutes... Moves when the appointment moves; stops if it's cancelled." },
  { kind: "reminder_due", label: "A follow-up reminder is due", help: "When a reminder's time arrives." },
  { kind: "plan_opened", label: "Lead opens their lead magnet", help: "The plan or guide from the form (Forms → Lead magnet), from the email or the thank-you page. Once for each." },
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
  { field: "pipeline", label: "Pipeline", options: () => optionsFor("pipeline") },
  { field: "source", label: "Source", options: () => optionsFor("source") },
  { field: "stage", label: "Stage", options: () => optionsFor("stage") },
  { field: "has_email", label: "Email", options: () => [{ v: "yes", l: "Has an email" }, { v: "no", l: "No email" }] },
  { field: "has_tag", label: "Tag", options: () => KNOWN_TAGS.map((v) => ({ v, l: v })) },
];

export const EXITS: { kind: ExitKind; label: string }[] = [
  { kind: "booked", label: "The lead books or signs (Booked, Viewing, Offer, Mandate, Bought)" },
  { kind: "lost", label: "The lead is marked Lost or Invalid Number" },
  { kind: "any_stage_change", label: "The lead's stage changes at all" },
];

/** Merge fields per message, exactly the ones the engine fills in
 *  (run-automations/workflows.ts). {{answers}} is every question and answer
 *  from the lead's form, one per line, so it fits any form. In emails,
 *  {{lead_magnet}} is the form's lead magnet as a box (Forms → Lead magnet),
 *  {{recent_sales}} the agent's latest sales, and a paragraph left empty by
 *  either (nothing to show) is left out.
 *  {{action_link}} is the agent's call link: never in an email to the lead.
 *  In a daily summary there's no lead: {{first_name}} is the agent's. */
export const FIELDS = {
  whatsapp_agent: ["first_name", "name", "phone", "email", "address", "form", "answers", "appointment", "stage", "next_label", "action_link"],
  daily: ["first_name", "count", "leads_word", "today", "pipeline", "not_called"],
  email_lead: ["first_name", "area", "address", "appointment", "lead_magnet", "recent_sales", "whatsapp_link", "agent_name", "agent_phone", "plan_link"],
} as const;
export type FieldSet = keyof typeof FIELDS;

/** The fields a step's message can use under this trigger. */
export function fieldsFor(step: "whatsapp_agent" | "email_lead", t: Trigger): readonly string[] {
  return step === "email_lead" ? FIELDS.email_lead : t.kind === "daily_at" ? FIELDS.daily : FIELDS.whatsapp_agent;
}

export type MessageKind = "whatsapp_agent" | "email_lead";

/** What each field is, in plain words, and what it turns into (the example is
 *  also what the previews show). Every field in FIELDS has an entry here. */
export interface FieldInfo { label: string; example: string; group: string }
const INFO: Record<string, FieldInfo> = {
  first_name: { label: "First name", example: "Thandi", group: "The lead" },
  name: { label: "Full name", example: "Thandi Mokoena", group: "The lead" },
  phone: { label: "Phone number", example: "082 555 0199", group: "The lead" },
  email: { label: "Email address", example: "thandi@example.com", group: "The lead" },
  address: { label: "Property address", example: "14 Oak Avenue, Bryanston", group: "The lead" },
  area: { label: "Their area", example: "Bryanston", group: "The lead" },
  appointment: { label: "Appointment time", example: "Tue 7 Oct at 10:00", group: "The lead" },
  stage: { label: "Stage", example: "No Answer", group: "The lead" },
  next_label: { label: "Next step", example: "Retry today", group: "The lead" },
  form: { label: "Form they filled in", example: "Home Value page", group: "Their form" },
  answers: { label: "All their answers", example: "When are you selling?: In 3 months\nProperty address: 14 Oak Avenue, Bryanston", group: "Their form" },
  action_link: { label: "Call-and-log link", example: "leads.estatekit.co/l/…", group: "Links" },
  agent_name: { label: "Agent's name", example: "Megan Demo", group: "The agent" },
  agent_phone: { label: "Agent's phone", example: "083 555 0103", group: "The agent" },
  lead_magnet: { label: "Lead magnet box", example: "YOUR MARKETING PLAN IS READY\nHow to sell your home without losing money or time.\nOpen my marketing plan: leads.estatekit.co/plan/…", group: "Extras" },
  recent_sales: { label: "Recent sales nearby", example: "Here's what's moved near you recently:\n- 12 Elm Road: sold for R2 150 000\nSee them all: leads.estatekit.co/sold/…", group: "Extras" },
  whatsapp_link: { label: "WhatsApp-the-agent link", example: "leads.estatekit.co/w/…", group: "Links" },
  plan_link: { label: "Marketing plan link", example: "leads.estatekit.co/plan/…", group: "Links" },
  count: { label: "Leads to call today", example: "7 leads", group: "Their day" },
  leads_word: { label: "\"lead\" or \"leads\"", example: "leads", group: "Their day" },
  today: { label: "Today's activity", example: "Today: 3 new leads came in and you updated 5 leads.", group: "Their day" },
  pipeline: { label: "Pipeline by stage", example: "• New Lead: 2\n• No Answer: 4\n• Contacted: 6\n• Booked: 3", group: "Their day" },
  not_called: { label: "Leads not called yet", example: "2 leads haven't been called yet (the oldest came in 1 day ago). Call them first tomorrow.", group: "Their day" },
};

/** A field's words, for this kind of message. In a daily summary there's no
 *  lead, so {{first_name}} is the agent's. */
export function fieldInfo(f: string, t?: Trigger): FieldInfo {
  if (f === "first_name" && t?.kind === "daily_at") return { label: "Agent's first name", example: "Megan", group: "Their day" };
  return INFO[f] ?? { label: `{{${f}}}`, example: "", group: "" };
}

/** Example values for every field, as the previews fill them in. */
export function sampleFields(t?: Trigger): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of Object.keys(INFO)) out[f] = fieldInfo(f, t).example;
  return out;
}

/** What tapping a field adds. "Leads to call today" brings its own "lead"/"leads",
 *  so nobody has to add the word that matches the number. */
export function fieldToken(f: string): string {
  return f === "count" ? "{{count}} {{leads_word}}" : `{{${f}}}`;
}

/** The fields a message can use, in groups, in the order to show them.
 *  {{leads_word}} still works but isn't offered: {{count}} adds it. */
export function fieldGroups(step: MessageKind, t: Trigger): { group: string; fields: string[] }[] {
  const groups: { group: string; fields: string[] }[] = [];
  for (const f of fieldsFor(step, t)) {
    if (f === "leads_word") continue;
    const g = fieldInfo(f, t).group;
    const at = groups.find((x) => x.group === g);
    if (at) at.fields.push(f); else groups.push({ group: g, fields: [f] });
  }
  return groups;
}

/** Fields used in a message, in order, once each. */
export function usedFields(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))];
}

const distance = (a: string, b: string) => {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

/** A field this message can't use, why, and the field it was probably meant to be. */
export interface BadField { field: string; why: string; suggest?: string }

export function badFields(text: string, kind: MessageKind, t: Trigger): BadField[] {
  const allowed = fieldsFor(kind, t);
  const out: BadField[] = [];
  for (const f of usedFields(text)) {
    if (allowed.includes(f)) continue;
    const known = f in INFO;
    const label = known ? `"${fieldInfo(f, t).label}"` : `{{${f}}}`;
    let why: string;
    if (!known) why = `${label} isn't a field.`;
    else if (f === "action_link" && kind === "email_lead") why = `${label} is the agent's call link. Don't send it to the lead.`;
    else if (t.kind === "daily_at" && kind === "whatsapp_agent") why = `${label} can't go in a daily summary: it goes to the agent about their whole day, not about one lead.`;
    else why = `${label} only works in ${kind === "email_lead" ? "a WhatsApp to the agent" : "an email to the lead"}, not here.`;
    const close = known ? undefined : allowed.find((x) => distance(x, f.toLowerCase()) <= 2);
    out.push({ field: f, why: close ? `${why} Did you mean "${fieldInfo(close, t).label}"?` : why, suggest: close });
  }
  return out;
}

/** The message with a field swapped for another, or taken out (tidying the gap it leaves). */
export function replaceField(text: string, field: string, to?: string): string {
  const token = `\\{\\{\\s*${field}\\s*\\}\\}`;
  if (to) return text.replace(new RegExp(token, "g"), `{{${to}}}`);
  return text
    .replace(new RegExp(`[ \\t]*${token}`, "g"), "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    case "appointment": return { kind, amount: 1, unit: "days", when: "before" };
    default: return { kind };
  }
}

/** The value a branch check starts with when picked. */
export function defaultBranchValue(check: BranchCheck): string {
  switch (check) {
    case "stage_is": return "New Lead";
    case "has_tag": return KNOWN_TAGS[0];
    case "source_is": return optionsFor("source")[0]?.v ?? SOURCES[0];
    case "pipeline_is": return optionsFor("pipeline")[0]?.v ?? PIPELINES[0];
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

/** The step a lead in a workflow does next, from its saved position
 *  (workflow_runs.pos: [i] or [i, "yes"|"no", j, …]). Mirrors the engine's
 *  stepAt + settle: past the end of a path carries on after its check.
 *  undefined when there's nothing left (the workflow is finishing). */
export function stepAtPos(steps: Step[], pos: readonly (number | string)[] | null | undefined): Step | undefined {
  const at = (p: (number | string)[]) => {
    let s: Step | undefined = steps[Number(p[0])];
    for (let k = 1; k < p.length; k += 2) {
      if (!s || s.type !== "branch") return undefined;
      s = (p[k] === "yes" ? s.yes : s.no)[Number(p[k + 1])];
    }
    return s;
  };
  let p = [...(pos?.length ? pos : [0])];
  for (;;) {
    const s = at(p);
    if (s) return s;
    if (p.length <= 1) return undefined;
    p = p.slice(0, -2);
    p[p.length - 1] = Number(p[p.length - 1]) + 1;
  }
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
    case "stage_changed": return `Lead moves to ${valueLabel("stage", t.stage ?? "")}`;
    case "no_answer_times": return `No answer ${t.count ?? 1} time${(t.count ?? 1) === 1 ? "" : "s"}`;
    case "not_contacted_for": return `Quiet for ${t.days ?? 14} day${(t.days ?? 14) === 1 ? "" : "s"}`;
    case "daily_at": return `Every weekday at ${t.time || "16:00"}`;
    case "appointment": return `${unitLabel(t.amount ?? 1, t.unit ?? "days")} ${t.when === "after" ? "after" : "before"} the appointment`;
    default: return TRIGGERS.find((x) => x.kind === t.kind)?.label ?? t.kind;
  }
}

/** The pick list a branch check or filter draws from. */
export const checkKind = (c: BranchCheck | FilterField): OptionKind | null =>
  c === "stage_is" || c === "stage" ? "stage" : c === "pipeline_is" || c === "pipeline" ? "pipeline" : c === "source_is" || c === "source" ? "source" : c === "has_tag" ? "tag" : null;

export const branchLabel = (c: BranchCheck) => BRANCH_CHECKS.find((x) => x.check === c)?.label ?? c;

export function stepSummary(s: Step): string {
  switch (s.type) {
    case "wait": return `Wait ${unitLabel(s.amount, s.unit)}`;
    case "whatsapp_agent": return s.text.split("\n")[0] || "No message yet";
    case "email_lead": return s.subject || "No subject yet";
    case "set_stage": return `Move to ${valueLabel("stage", s.stage)}`;
    case "reminder": return `${s.label || "Reminder"} · ${s.inDays === 0 ? "due today" : `in ${unitLabel(s.inDays, "days")}`}`;
    case "tag": return s.tag ? `Tag "${s.tag}"` : "No tag yet";
    case "branch": {
      const needs = BRANCH_CHECKS.find((x) => x.check === s.check)?.needsValue;
      const k = checkKind(s.check);
      return `${branchLabel(s.check)}${needs ? ` ${k ? valueLabel(k, s.value) : s.value || "…"}` : ""}?`;
    }
  }
}

export const stepTitle = (s: Step | { type: StepType }) => STEP_TYPES.find((x) => x.type === s.type)?.label ?? s.type;

export function filterSummary(f: Filter): string {
  if (f.field === "has_email") return f.value === "no" ? "Has no email" : "Has an email";
  if (f.field === "has_tag") return `Tagged ${f.value || "…"}`;
  const k = checkKind(f.field);
  return `${FILTER_FIELDS.find((x) => x.field === f.field)?.label}: ${k ? valueLabel(k, f.value) : f.value || "…"}`;
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

function fieldProblems(text: string, kind: MessageKind, t: Trigger): string[] {
  return badFields(text, kind, t).map((b) => `${b.why} Tap ${b.suggest ? "Fix" : "Remove"} under the message.`);
}

export function validate(wf: Workflow): Problems {
  const p: Problems = {};
  const add = (key: string, msg: string) => { (p[key] ??= []).push(msg); };
  const t = wf.trigger;

  if (!wf.name.trim()) add("workflow", "Give the workflow a name.");
  if (t.kind === "stage_changed" && !t.stage) add("trigger", "Pick the stage.");
  if (t.kind === "stage_changed" && t.stage) { const tp = valueProblem("stage", t.stage); if (tp) add("trigger", tp); }
  if (t.kind === "no_answer_times" && !(Number.isInteger(t.count) && (t.count ?? 0) >= 1)) add("trigger", "Missed calls must be a whole number, 1 or more.");
  if (t.kind === "not_contacted_for" && !(Number.isInteger(t.days) && (t.days ?? 0) >= 1)) add("trigger", "Days must be a whole number, 1 or more.");
  if (t.kind === "appointment") {
    if (!Number.isInteger(t.amount) || (t.amount ?? 0) < 1) add("trigger", "How long before or after must be a whole number, 1 or more.");
    else if (t.unit === "minutes" && (t.amount ?? 0) < 5) add("trigger", "At least 5 minutes: messages go out once a minute.");
  }
  if (t.kind === "daily_at" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time ?? "")) add("trigger", "Pick a time.");

  const seen = new Set<string>();
  for (const f of wf.filters) {
    if (!f.value) add("filters", `Pick a value for ${FILTER_FIELDS.find((x) => x.field === f.field)?.label}.`);
    const fk = checkKind(f.field);
    const fp = fk ? valueProblem(fk, f.value) : null;
    if (fp) add("filters", fp);
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
          else { const sp = valueProblem("stage", s.stage); if (sp) add(s.id, sp); }
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
          const bk = checkKind(s.check);
          const bp = meta?.needsValue && bk ? valueProblem(bk, s.value) : null;
          if (bp) add(s.id, bp);
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
    name: "Not tracked: stay in touch",
    blurb: "Leads Facebook didn't count (usually not ready to sell yet) get a friendly email after 2 weeks and a reminder for the agent.",
    make: () => ({
      ...blankWorkflow(), name: "Not tracked: stay in touch",
      filters: [{ field: "has_tag", value: "Not tracked" }, { field: "has_email", value: "yes" }],
      steps: [
        { id: newId(), type: "wait", amount: 14, unit: "days" },
        { id: newId(), type: "email_lead", subject: "Still thinking about selling, {{first_name}}?", body: "Hi {{first_name}},\n\nJust checking in. Whenever you're ready, I'm happy to give you an up-to-date valuation for your home in {{area}}.\n\n{{agent_name}}\n{{agent_phone}}" },
        { id: newId(), type: "reminder", label: "Check in with {{first_name}}", inDays: 3 },
      ],
    }),
  },
  {
    name: "Not ready yet: stay in touch",
    blurb: "A lead marked Lost (not selling yet) gets a market update email every couple of months, and the agent a reminder to call every 3 months. Stops if they come back.",
    make: () => ({
      ...blankWorkflow(), name: "Not ready yet: stay in touch",
      trigger: { kind: "stage_changed", stage: "Lost" },
      filters: [{ field: "has_email", value: "yes" }],
      exits: [{ kind: "booked", on: true }, { kind: "lost", on: false }, { kind: "any_stage_change", on: true }],
      steps: [
        { id: newId(), type: "wait", amount: 30, unit: "days" },
        { id: newId(), type: "email_lead", subject: "What's selling near you, {{first_name}}", body: "Hi {{first_name}},\n\nI know you're not looking to sell right now, so no pressure at all. I just thought you'd like to see what's happening near you.\n\n{{recent_sales}}\n\nIf you'd ever like to know what your home is worth today, just reply to this email.\n\n{{agent_name}}\n{{agent_phone}}" },
        { id: newId(), type: "wait", amount: 60, unit: "days" },
        { id: newId(), type: "whatsapp_agent", text: "It's been 3 months since {{name}} said not now. A quick check-in call could catch them early: {{action_link}}" },
        { id: newId(), type: "email_lead", subject: "Your home's value, {{first_name}}", body: "Hi {{first_name}},\n\nPrices near you have kept moving. If you're curious what {{address}} could sell for today, I'm happy to do a free, no-obligation valuation.\n\n{{recent_sales}}\n\n{{agent_name}}\n{{agent_phone}}" },
        { id: newId(), type: "wait", amount: 90, unit: "days" },
        { id: newId(), type: "whatsapp_agent", text: "6 months since {{name}} said not now. Time for another check-in: {{action_link}}" },
        { id: newId(), type: "email_lead", subject: "Still thinking about selling, {{first_name}}?", body: "Hi {{first_name}},\n\nJust checking in. Whenever you're ready to talk about selling, even if it's just to know your options, I'm here.\n\n{{agent_name}}\n{{agent_phone}}" },
      ],
    }),
  },
  {
    name: "Appointment: day-before reminder",
    blurb: "The day before: the agent gets the details, and the lead gets a friendly reminder email.",
    make: () => ({
      ...blankWorkflow(), name: "Appointment: day-before reminder",
      trigger: { kind: "appointment", amount: 1, unit: "days", when: "before" },
      settings: { ...defaultSettings(), quietHours: false },
      steps: [
        { id: newId(), type: "whatsapp_agent", text: "Tomorrow: {{name}}, {{appointment}}.\n{{address}}\n{{phone}}\n\nConfirm with them: {{action_link}}" },
        {
          id: newId(), type: "branch", check: "has_email", value: "",
          yes: [{ id: newId(), type: "email_lead", subject: "See you {{appointment}}", body: "Hi {{first_name}},\n\nJust a reminder that we're meeting {{appointment}}.\n\nIf the time no longer works, reply here or call me and we'll find another.\n\n{{agent_name}}\n{{agent_phone}}" }],
          no: [],
        },
      ],
    }),
  },
  {
    name: "Appointment: 1 hour before",
    blurb: "A heads-up for the agent an hour before, with the address and number.",
    make: () => ({
      ...blankWorkflow(), name: "Appointment: 1 hour before",
      trigger: { kind: "appointment", amount: 1, unit: "hours", when: "before" },
      settings: { ...defaultSettings(), quietHours: false },
      steps: [{ id: newId(), type: "whatsapp_agent", text: "In 1 hour: {{name}}, {{appointment}}.\n{{address}}\n{{phone}}" }],
    }),
  },
  {
    name: "After the appointment: log it",
    blurb: "2 hours after, ask the agent how it went, with the link to log it.",
    make: () => ({
      ...blankWorkflow(), name: "After the appointment: log it",
      trigger: { kind: "appointment", amount: 2, unit: "hours", when: "after" },
      steps: [{ id: newId(), type: "whatsapp_agent", text: "How did it go with {{first_name}}? Log it: {{action_link}}" }],
    }),
  },
  {
    name: "Blank workflow",
    blurb: "Pick your own trigger and steps.",
    make: blankWorkflow,
  },
];
