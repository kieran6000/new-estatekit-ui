// The workflow engine: runs the workflows built under Automations → Workflows.
//
// Called by run-automations every minute, with its WhatsApp sender and send
// budget, so sends never break TextMeBot's one-message-per-5-seconds limit.
// Every account runs on workflows (Oct 2026); the old shared automations
// only remain as a no-op path in index.ts.
//
// A run is one lead (or one agent, for a weekday summary) going through one
// workflow. `pos` says where it is in the step tree: [3] is the 4th main
// step, [3, "yes", 0] the 1st step on the Yes path of the 4th. Each pass runs
// steps until a wait (or the send budget) and saves the position.
//
// KEEP IN STEP with src/lib/workflow.ts (the model the builder saves).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

type Unit = "minutes" | "hours" | "days";
type Step =
  | { id: string; type: "wait"; amount: number; unit: Unit }
  | { id: string; type: "whatsapp_agent"; text: string }
  | { id: string; type: "email_lead"; subject: string; body: string }
  | { id: string; type: "set_stage"; stage: string }
  | { id: string; type: "reminder"; label: string; inDays: number }
  | { id: string; type: "tag"; tag: string }
  | { id: string; type: "branch"; check: string; value: string; yes: Step[]; no: Step[] };

interface Definition {
  trigger: { kind: string; amount?: number; unit?: Unit; when?: "before" | "after" };
  filters: { field: string; value: string }[];
  steps: Step[];
  exits: { kind: string; on: boolean }[];
  settings: { quietHours: boolean; reEnter: boolean };
}

interface Run {
  id: string;
  workflow_id: string;
  agent_id: string;
  lead_id: string | null;
  pos: (number | string)[];
  started: boolean;
  start_stage: string | null;
  last_email_id: string | null;
}

interface Lead {
  id: string;
  agent_id: string;
  name: string;
  phone: string;
  email: string | null;
  stage: string;
  next_label: string;
  pipeline_id: string | null;
  source_page_id: string | null;
  fb_lead_id: string | null;
  quality: string | null;
  tags: string[] | null;
  email_opt_out: boolean;
  archived: boolean;
  form_answers: unknown;
  plan_token: string | null;
  appointment_at: string | null;
}

interface Profile {
  display_name: string | null;
  whatsapp_number: string | null;
  email: string | null;
  company: string | null;
  automations_paused: boolean | null;
  deactivated_at: string | null;
}

export type SendResult = "sent" | "rate_limited" | "failed" | "not_configured";

export interface EngineDeps {
  sendWhatsApp: (phone: string, text: string) => Promise<SendResult>;
  actionLink: (leadId: string, agentId: string, linkType: string) => Promise<string>;
  linkTypeFor: (name: string) => string;
  quietDeferUntil: (now: Date) => Date | null;
  budget: { sends: number };
  maxSends: number;
  /** The client-activity Discord channel, like the old automations post to. */
  logToDiscord?: (msg: string) => Promise<void>;
}

const APP = "https://leads.estatekit.co";
const FROM_ADDRESS = "hello@mail.estatekit.co";
const BOOKED = ["Booked", "Viewing Booked", "Offer Made", "Mandate Signed", "Bought"];
const LOST = ["Lost", "Invalid Number"];
const SETTLED = [...LOST, ...BOOKED];
const RATE_LIMIT_RETRY_MS = 30_000;
/** Steps one run may take in a single pass; stops a looping edit spinning. */
const MAX_STEPS_PER_PASS = 25;

// ── Small helpers ─────────────────────────────────────────────────────────

const first = (s: string | null | undefined) => (s || "").trim().split(/\s+/)[0] || "";
const digits = (s: string | null | undefined) => {
  const d = (s || "").replace(/\D/g, "");
  return d.length === 10 && d.startsWith("0") ? "27" + d.slice(1) : d;
};
const prettyPhone = (s: string) => {
  const d = digits(s);
  return d.length === 11 && d.startsWith("27") ? `0${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : s;
};
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const waitMinutes = (s: { amount: number; unit: Unit }) => s.amount * (s.unit === "minutes" ? 1 : s.unit === "hours" ? 60 : 1440);
/** "12 long kloof midrand" → "12 Long Kloof Midrand"; anything with capitals is left as typed. */
const tidyAddress = (s: string) => {
  const raw = s.trim().slice(0, 160);
  return raw === raw.toLowerCase() ? raw.replace(/\b([a-z])/g, (m) => m.toUpperCase()) : raw;
};
/** "Tue 7 Oct at 10:00", in South African time. */
export function appointmentLabel(iso: string | null | undefined): string {
  if (!iso) return "no time set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "no time set";
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", ...o }).format(d);
  return `${part({ weekday: "short" })} ${part({ day: "numeric" })} ${part({ month: "short" })} at ${part({ hour: "2-digit", minute: "2-digit", hour12: false })}`;
}
/** A form's lead magnet, as the thank-you page and emails show it.
 *  KEEP IN STEP with src/lib/leadMagnet.ts (MAGNET_PRESETS and resolveMagnet). */
interface Magnet { title: string; text: string; button: string }
const MAGNET_DEFAULTS: Record<"plan" | "pdf", Magnet> = {
  plan: { title: "Your marketing plan is ready", text: "How to sell your home without losing money or time. A 2-minute read.", button: "Open my marketing plan" },
  pdf: { title: "Your free guide", text: "", button: "Open it" },
};
interface PageRow {
  name: string | null; suburb: string | null; fb_pixel_id: string | null; phone: string | null;
  magnet_kind: string | null; magnet_title: string | null; magnet_text: string | null; magnet_button: string | null; magnet_pdf_url: string | null;
}
export function resolveMagnet(page: PageRow | null, pipelineKind: string | null): (Magnet & { kind: "plan" | "pdf" }) | null {
  let kind = page?.magnet_kind ?? (pipelineKind === "seller" ? "plan" : "none");
  if (kind === "pdf" && !page?.magnet_pdf_url) kind = "none";
  if (kind !== "plan" && kind !== "pdf") return null;
  const d = MAGNET_DEFAULTS[kind];
  return { kind, title: page?.magnet_title?.trim() || d.title, text: page?.magnet_text?.trim() || d.text, button: page?.magnet_button?.trim() || d.button };
}
/** Where {{lead_magnet}} sits in an email body until it's drawn as a box. */
const MAGNET_MARK = "\u0000MAGNET\u0000";
const rand = (n: number) => `R${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
const fill = (t: string, v: Record<string, string>) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in v ? v[k] : m));

/** The step at `pos`, or undefined when the position is past the end of its list. */
export function stepAt(steps: Step[], pos: (number | string)[]): Step | undefined {
  let list = steps;
  let s: Step | undefined = list[Number(pos[0])];
  for (let k = 1; k < pos.length; k += 2) {
    if (!s || s.type !== "branch") return undefined;
    list = pos[k] === "yes" ? s.yes : s.no;
    s = list[Number(pos[k + 1])];
  }
  return s;
}

/** The next step after `pos`: down the same list, else back out of the branch.
 *  null when the workflow is finished. */
export function settle(steps: Step[], pos: (number | string)[]): (number | string)[] | null {
  let p = [...pos];
  for (;;) {
    if (stepAt(steps, p)) return p;
    if (p.length <= 1) return null;
    p = p.slice(0, -2);
    p[p.length - 1] = Number(p[p.length - 1]) + 1;
  }
}
export const next = (pos: (number | string)[]) => [...pos.slice(0, -1), Number(pos[pos.length - 1]) + 1];

async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The unsubscribe link in workflow emails. Signed, so nobody can opt out
 *  someone else's lead. KEEP IN STEP with email-unsubscribe. */
export async function unsubscribeUrl(leadId: string): Promise<string> {
  const sig = (await hmacHex(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, `unsub:${leadId}`)).slice(0, 32);
  return `${APP}/unsubscribe/${leadId}/${sig}`;
}

// ── The engine ───────────────────────────────────────────────────────────

export async function runWorkflows(supabase: SupabaseClient, deps: EngineDeps): Promise<number> {
  const { error: scanErr } = await supabase.rpc("enqueue_scheduled_workflows");
  if (scanErr) console.error("workflow scan failed", scanErr.message);

  const { data: due, error } = await supabase
    .from("workflow_runs")
    .select("id, workflow_id, agent_id, lead_id, pos, started, start_stage, last_email_id")
    .eq("status", "pending")
    .lte("run_at", new Date().toISOString())
    .order("run_at", { ascending: true })
    .limit(100);
  if (error) {
    console.error("workflow runs read failed", error.message);
    return 0;
  }

  let processed = 0;
  for (const run of (due ?? []) as Run[]) {
    const { data: claimed } = await supabase
      .from("workflow_runs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    try {
      await processRun(supabase, deps, run);
    } catch (e) {
      console.error("workflow run failed", run.id, e);
      await supabase.from("workflow_runs").update({ status: "failed", stop_reason: String(e).slice(0, 300), updated_at: new Date().toISOString() }).eq("id", run.id);
      await log(supabase, run, null, "Workflow", "Failed", String(e).slice(0, 300));
    }
    processed++;
  }
  return processed;
}

async function log(supabase: SupabaseClient, run: Run, stepId: string | null, what: string, status: string, detail?: string) {
  const { error } = await supabase.from("workflow_log").insert({
    run_id: run.id, workflow_id: run.workflow_id, agent_id: run.agent_id, lead_id: run.lead_id,
    step_id: stepId, what, status, detail: detail ?? null,
  });
  if (error) console.error("workflow log failed", error.message);
}

async function save(supabase: SupabaseClient, run: Run, patch: Record<string, unknown>) {
  const { error } = await supabase.from("workflow_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", run.id);
  if (error) throw new Error(`save run: ${error.message}`);
}

async function processRun(supabase: SupabaseClient, deps: EngineDeps, run: Run) {
  const { data: wf } = await supabase.from("workflows").select("id, name, published, definition").eq("id", run.workflow_id).maybeSingle();
  if (!wf?.published) {
    await save(supabase, run, { status: "cancelled", stop_reason: "The workflow was switched off" });
    return;
  }
  const def = wf.definition as Definition;

  const { data: profileRow } = await supabase
    .from("agent_profiles")
    .select("display_name, whatsapp_number, email, company, automations_paused, deactivated_at")
    .eq("agent_id", run.agent_id)
    .maybeSingle();
  const profile = profileRow as Profile | null;
  if (profile?.automations_paused || profile?.deactivated_at) {
    // A weekday summary is about today: drop it (as the old digest did), so
    // switching the account back on never sends yesterday's numbers.
    if (!run.lead_id) {
      await save(supabase, run, { status: "cancelled", stop_reason: profile.deactivated_at ? "The account is deactivated" : "The account's automations are paused" });
      return;
    }
    // Held, like the old automations: Scheduled → Resume (or switching the
    // account back on) releases it.
    await save(supabase, run, { status: "paused" });
    return;
  }

  let lead: Lead | null = null;
  if (run.lead_id) {
    const { data } = await supabase
      .from("leads")
      .select("id, agent_id, name, phone, email, stage, next_label, pipeline_id, source_page_id, fb_lead_id, quality, tags, email_opt_out, archived, form_answers, plan_token, appointment_at")
      .eq("id", run.lead_id)
      .maybeSingle();
    lead = data as Lead | null;
    if (!lead || lead.archived) {
      await save(supabase, run, { status: "cancelled", stop_reason: lead ? "The lead was archived" : "The lead was deleted" });
      return;
    }
  }

  const ctx = new Context(supabase, deps, run, wf.name, def, profile, lead);

  if (!run.started) {
    if (lead && !(await ctx.matchesFilters())) {
      await save(supabase, run, { status: "cancelled", started: true, stop_reason: "Didn't match \"Only run if\"" });
      await log(supabase, run, null, "Only run if", "Skipped", "This lead didn't match");
      return;
    }
    run.started = true;
    await save(supabase, run, { started: true });
  }

  let pos = settle(def.steps, run.pos);
  for (let n = 0; n < MAX_STEPS_PER_PASS; n++) {
    if (!pos) {
      await save(supabase, run, { status: "completed", pos: run.pos });
      return;
    }
    if (lead) {
      const stop = ctx.stopReason();
      if (stop) {
        await save(supabase, run, { status: "stopped", stop_reason: stop, pos });
        await log(supabase, run, null, "Stopped early", "Stopped", stop);
        return;
      }
    }
    const step = stepAt(def.steps, pos)!;
    const outcome = await ctx.runStep(step, pos);
    if (outcome.kind === "hold") {
      await save(supabase, run, { status: "pending", run_at: outcome.until.toISOString(), pos });
      return;
    }
    if (outcome.kind === "wait") {
      run.pos = settle(def.steps, next(pos)) ?? next(pos);
      await save(supabase, run, { status: "pending", run_at: outcome.until.toISOString(), pos: run.pos });
      return;
    }
    run.pos = outcome.kind === "goto" ? outcome.pos : next(pos);
    pos = settle(def.steps, run.pos);
  }
  // A lot of instant steps in one go: carry on next minute.
  await save(supabase, run, { status: "pending", run_at: new Date().toISOString(), pos: pos ?? run.pos });
}

type Outcome = { kind: "done" } | { kind: "goto"; pos: (number | string)[] } | { kind: "wait"; until: Date } | { kind: "hold"; until: Date };

class Context {
  private pageCache: PageRow | null | undefined;
  private kindCache: string | null | undefined;

  constructor(
    private supabase: SupabaseClient,
    private deps: EngineDeps,
    private run: Run,
    private wfName: string,
    private def: Definition,
    private profile: Profile | null,
    private lead: Lead | null,
  ) {}

  private async page() {
    if (this.pageCache === undefined) {
      this.pageCache = null;
      if (this.lead?.source_page_id) {
        const { data } = await this.supabase.from("lead_pages").select("name, suburb, fb_pixel_id, phone, magnet_kind, magnet_title, magnet_text, magnet_button, magnet_pdf_url").eq("id", this.lead.source_page_id).maybeSingle();
        this.pageCache = data;
      }
    }
    return this.pageCache;
  }

  private async pipelineKind(): Promise<string | null> {
    if (this.kindCache === undefined) {
      this.kindCache = null;
      if (this.lead?.pipeline_id) {
        const { data } = await this.supabase.from("pipelines").select("kind").eq("id", this.lead.pipeline_id).maybeSingle();
        this.kindCache = data?.kind ?? null;
      }
    }
    return this.kindCache ?? null;
  }

  /** "Not tracked" (KEEP IN STEP with src/lib/leadTags.ts): a lead-page lead
   *  Facebook was never told about. */
  private async notTracked(): Promise<boolean> {
    const l = this.lead!;
    if (l.fb_lead_id || !l.source_page_id) return false;
    if (l.quality === "weak") return true;
    const p = await this.page();
    return !!p && !p.fb_pixel_id;
  }

  private async hasTag(tag: string): Promise<boolean> {
    if ((this.lead!.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase())) return true;
    return tag === "Not tracked" ? this.notTracked() : false;
  }

  private source(): string {
    const l = this.lead!;
    return l.fb_lead_id ? "Facebook form" : l.source_page_id ? "EstateKit page" : "Added by hand";
  }

  /** "id:<uuid>" is one of the account's pipelines; "Sellers", "Buyers" and
   *  "General" mean any pipeline of that kind (templates use these).
   *  KEEP IN STEP with optionsFor in src/lib/workflow.ts. */
  private async pipelineIs(v: string): Promise<boolean> {
    if (v.startsWith("id:")) return this.lead?.pipeline_id === v.slice(3);
    const k = await this.pipelineKind();
    return (v === "Sellers" && k === "seller") || (v === "Buyers" && k === "buyer") || (v === "General" && k === "general");
  }

  /** "page:<uuid>" is one of the account's forms; otherwise the kind of source. */
  private sourceIs(v: string): boolean {
    if (v.startsWith("page:")) return this.lead?.source_page_id === v.slice(5);
    return this.source() === v;
  }

  async matchesFilters(): Promise<boolean> {
    const l = this.lead!;
    for (const f of this.def.filters ?? []) {
      if (f.field === "pipeline" && !(await this.pipelineIs(f.value))) return false;
      if (f.field === "source" && !this.sourceIs(f.value)) return false;
      if (f.field === "stage" && l.stage !== f.value) return false;
      if (f.field === "has_email" && (f.value === "no") === !!(l.email || "").trim()) return false;
      if (f.field === "has_tag" && !(await this.hasTag(f.value))) return false;
    }
    return true;
  }

  /** Why the run should stop before its next step, or null. */
  stopReason(): string | null {
    const stage = this.lead!.stage;
    const on = (k: string) => (this.def.exits ?? []).some((e) => e.kind === k && e.on);
    // Appointment workflows are for booked leads: only signing (or an offer)
    // counts as "booked" for them, not the appointment itself.
    const bookedNow = this.def.trigger.kind === "appointment" ? BOOKED.filter((s) => s !== "Booked" && s !== "Viewing Booked") : BOOKED;
    if (on("booked") && bookedNow.includes(stage)) return `Lead moved to ${stage}`;
    if (on("lost") && LOST.includes(stage)) return `Lead moved to ${stage}`;
    if (on("any_stage_change") && this.run.start_stage && stage !== this.run.start_stage) return `Lead moved to ${stage}`;
    return null;
  }

  private quietHold(): Outcome | null {
    if (!this.def.settings?.quietHours) return null;
    // A reminder before an appointment is no use after it: always on time.
    if (this.def.trigger.kind === "appointment" && this.def.trigger.when !== "after") return null;
    const until = this.deps.quietDeferUntil(new Date());
    return until ? { kind: "hold", until } : null;
  }

  async runStep(step: Step, pos: (number | string)[]): Promise<Outcome> {
    switch (step.type) {
      case "wait":
        return { kind: "wait", until: new Date(Date.now() + waitMinutes(step) * 60_000) };
      case "whatsapp_agent":
        return this.whatsApp(step);
      case "email_lead":
        return this.email(step);
      case "set_stage":
        return this.setStage(step);
      case "reminder":
        return this.reminder(step);
      case "tag":
        return this.tag(step);
      case "branch": {
        const yes = await this.check(step);
        await log(this.supabase, this.run, step.id, "If / else", yes ? "Yes" : "No");
        const side = yes ? step.yes : step.no;
        return side.length ? { kind: "goto", pos: [...pos, yes ? "yes" : "no", 0] } : { kind: "done" };
      }
    }
    return { kind: "done" };
  }

  private async check(step: Extract<Step, { type: "branch" }>): Promise<boolean> {
    const l = this.lead;
    if (!l) return false;
    switch (step.check) {
      case "stage_is": return l.stage === step.value;
      case "has_tag": return this.hasTag(step.value);
      case "has_email": return !!(l.email || "").trim() && !l.email_opt_out;
      case "source_is": return this.sourceIs(step.value);
      case "pipeline_is": return this.pipelineIs(step.value);
      case "opened_last_email": {
        if (!this.run.last_email_id) return false;
        const { data } = await this.supabase.from("workflow_emails").select("opened_at").eq("id", this.run.last_email_id).maybeSingle();
        return !!data?.opened_at;
      }
    }
    return false;
  }

  /** What a weekday summary counts: the same as the old daily digest (new
   *  leads from today nobody touched, plus reminders now due). */
  private async dailyCount(): Promise<number> {
    const sastToday = new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
    const dayStart = new Date(`${sastToday}T00:00:00+02:00`).toISOString();
    const [{ count: fresh }, { count: dueNow }] = await Promise.all([
      this.supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("agent_id", this.run.agent_id).eq("archived", false).eq("stage", "New Lead").gte("created_at", dayStart),
      this.supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("agent_id", this.run.agent_id).eq("archived", false).eq("due", true)
        .not("reminder_at", "is", null).lte("reminder_at", new Date().toISOString())
        .not("stage", "in", `(${SETTLED.map((s) => `"${s}"`).join(",")})`),
    ]);
    return (fresh ?? 0) + (dueNow ?? 0);
  }

  /** The end-of-day report fields: what came in and what the agent did
   *  today, where the pipeline stands, and leads never called. null when
   *  the account has no open leads and nothing happened today. */
  private async dailyReport(): Promise<{ today: string; pipeline: string; not_called: string } | null> {
    const sastToday = new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
    const dayStart = new Date(`${sastToday}T00:00:00+02:00`).toISOString();
    const [{ data: leads }, { data: touched }] = await Promise.all([
      this.supabase.from("leads").select("stage, created_at").eq("agent_id", this.run.agent_id).eq("archived", false).limit(5000),
      this.supabase.from("lead_events").select("lead_id").eq("agent_id", this.run.agent_id).gte("created_at", dayStart)
        .not("actor_id", "is", null).in("event_type", ["stage_changed", "call", "note_changed"]).limit(5000),
    ]);
    const rows = (leads ?? []) as { stage: string; created_at: string }[];
    const newToday = rows.filter((r) => r.created_at >= dayStart).length;
    const updatedToday = new Set((touched ?? []).map((t: { lead_id: string }) => t.lead_id)).size;
    const open = rows.filter((r) => !LOST.includes(r.stage));
    if (!open.length && !newToday && !updatedToday) return null;
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
    const order = ["New Lead", "No Answer", "Contacted", "Booked", "Viewing Booked", "Offer Made", "Mandate Signed", "Bought"];
    const byStage = new Map<string, number>();
    for (const r of open) byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + 1);
    const rank = (st: string) => (order.includes(st) ? order.indexOf(st) : order.length);
    const stages = [...byStage.keys()].sort((a, b) => rank(a) - rank(b));
    // Never called: still "New Lead" an hour after it came in.
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const waiting = open.filter((r) => r.stage === "New Lead" && r.created_at < hourAgo);
    const oldest = waiting.reduce((m, r) => (r.created_at < m ? r.created_at : m), new Date().toISOString());
    const days = Math.floor((Date.now() - Date.parse(oldest)) / 86_400_000);
    return {
      today: `Today: ${plural(newToday, "new lead")} came in and you updated ${plural(updatedToday, "lead")}.`,
      pipeline: stages.map((st) => `• ${st}: ${byStage.get(st)}`).join("\n") || "• Nothing open",
      not_called: waiting.length
        ? `${waiting.length === 1 ? "1 lead hasn't" : `${waiting.length} leads haven't`} been called yet${days >= 1 ? ` (the oldest came in ${days === 1 ? "yesterday" : `${days} days ago`})` : ""}. Call them first tomorrow.`
        : "Every new lead has been called. Nice work.",
    };
  }

  private async whatsApp(step: Extract<Step, { type: "whatsapp_agent" }>): Promise<Outcome> {
    const l = this.lead;
    // New-lead alerts are time-critical; everything else respects quiet hours.
    if (this.def.trigger.kind !== "lead_created") {
      const hold = this.quietHold();
      if (hold) return hold;
    }
    const phone = this.profile?.whatsapp_number;
    if (!phone) {
      await log(this.supabase, this.run, step.id, "WhatsApp the agent", "Skipped", "The account has no WhatsApp number");
      return { kind: "done" };
    }

    let text: string;
    if (!l) {
      const agentFirst = first(this.profile?.display_name) || "there";
      if (/\{\{\s*(today|pipeline|not_called)\s*\}\}/.test(step.text)) {
        // End-of-day report: sent whenever there's a pipeline to report on.
        const report = await this.dailyReport();
        if (!report) {
          await log(this.supabase, this.run, step.id, "WhatsApp the agent", "Skipped", "No open leads and nothing happened today");
          return { kind: "done" };
        }
        text = fill(step.text, { first_name: agentFirst, ...report });
      } else {
        const count = await this.dailyCount();
        if (count === 0) {
          await log(this.supabase, this.run, step.id, "WhatsApp the agent", "Skipped", "Nothing to update today");
          return { kind: "done" };
        }
        text = fill(step.text, { first_name: agentFirst, count: String(count), leads_word: count === 1 ? "lead" : "leads" });
      }
    } else {
      const answers = Array.isArray(l.form_answers) ? (l.form_answers as { q?: string; a?: string }[]) : [];
      const fields: Record<string, string> = {
        first_name: first(l.name) || l.name, name: l.name, stage: l.stage, next_label: l.next_label ?? "",
        phone: prettyPhone(l.phone || ""), email: (l.email || "").trim() || "no email",
        address: tidyAddress(answers.find((x) => /address/i.test(x.q || ""))?.a || ""),
        form: l.fb_lead_id ? "Facebook form" : (await this.page())?.name || (l.source_page_id ? "Lead page" : "Added by hand"),
        answers: answers.filter((x) => (x.a || "").trim()).map((x) => `${(x.q || "").trim()}: ${(x.a || "").trim()}`).join("\n") || "No answers",
        appointment: appointmentLabel(l.appointment_at),
      };
      if (/\{\{\s*action_link\s*\}\}/.test(step.text)) fields.action_link = await this.deps.actionLink(l.id, l.agent_id, this.deps.linkTypeFor(this.wfName));
      text = fill(step.text, fields);
    }

    if (this.deps.budget.sends >= this.deps.maxSends) return { kind: "hold", until: new Date() };
    this.deps.budget.sends++;
    const result = await this.deps.sendWhatsApp(phone, text);
    if (result === "rate_limited") return { kind: "hold", until: new Date(Date.now() + RATE_LIMIT_RETRY_MS) };
    const who = this.profile?.display_name || phone;
    if (result === "sent") {
      await log(this.supabase, this.run, step.id, "WhatsApp the agent", "Sent", text.slice(0, 300));
      await this.deps.logToDiscord?.(`\u{2699}\u{FE0F} Workflow **${this.wfName}** sent WhatsApp to **${who}**${l ? ` re: ${l.name}` : ""}`);
      if (l) {
        await this.supabase.from("lead_events").insert({
          lead_id: l.id, agent_id: l.agent_id, event_type: "whatsapp_sent", to_value: this.wfName, source: "automation",
        });
      }
    } else {
      await log(this.supabase, this.run, step.id, "WhatsApp the agent", "Failed", result === "not_configured" ? "WhatsApp sending isn't set up" : "The WhatsApp service didn't accept it");
      await this.deps.logToDiscord?.(`\u{26A0}\u{FE0F} Workflow **${this.wfName}** could NOT send WhatsApp to **${who}**${l ? ` re: ${l.name}` : ""} (${result})`);
    }
    return { kind: "done" };
  }

  /** The lead magnet's link (KEEP IN STEP with the form's lead magnet: no
   *  setting = the marketing plan for sellers, nothing otherwise). A lead
   *  with nothing to open gets the agent's recent sales instead. */
  private async planLink(l: Lead): Promise<string> {
    if (l.plan_token) return `${APP}/plan/${l.plan_token}`;
    const kind = (await this.page())?.magnet_kind ?? ((await this.pipelineKind()) === "seller" ? "plan" : "none");
    if (kind === "none") return `${APP}/sold/${l.agent_id}`;
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error } = await this.supabase.from("leads").update({ plan_token: token }).eq("id", l.id).is("plan_token", null);
    if (error) return `${APP}/sold/${l.agent_id}`;
    l.plan_token = token;
    return `${APP}/plan/${token}`;
  }

  /** The agent's latest sales, for {{recent_sales}}: a short list and a link
   *  to them all, or nothing when there are none (the paragraph is dropped). */
  private async recentSales(l: Lead): Promise<string> {
    const { data } = await this.supabase.from("sold_listings").select("address, price, status").eq("agent_id", l.agent_id).order("sort_order").limit(3);
    const rows = (data ?? []) as { address: string | null; price: number | null; status: string | null }[];
    if (!rows.length) return "";
    const lines = rows.map((r) => `- ${(r.address || "A home nearby").trim()}${r.price ? `: ${r.status === "listed" ? "listed at" : "sold for"} ${rand(r.price)}` : ""}`);
    return `Here's what's moved near you recently:\n${lines.join("\n")}\n\nSee them all: ${APP}/sold/${l.agent_id}`;
  }

  private async email(step: Extract<Step, { type: "email_lead" }>): Promise<Outcome> {
    const l = this.lead;
    if (!l) return { kind: "done" };
    const to = (l.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      await log(this.supabase, this.run, step.id, "Email the lead", "Skipped", "No email address");
      return { kind: "done" };
    }
    if (l.email_opt_out) {
      await log(this.supabase, this.run, step.id, "Email the lead", "Skipped", "They unsubscribed");
      return { kind: "done" };
    }
    const hold = this.quietHold();
    if (hold) return hold;
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      await log(this.supabase, this.run, step.id, "Email the lead", "Failed", "Email sending isn't set up");
      return { kind: "done" };
    }

    const page = await this.page();
    const answers = Array.isArray(l.form_answers) ? (l.form_answers as { q?: string; a?: string }[]) : [];
    const address = tidyAddress(answers.find((x) => /address/i.test(x.q || ""))?.a || "");
    const agentName = (this.profile?.display_name || "").trim() || "Your agent";
    const fields: Record<string, string> = {
      first_name: first(l.name) || "there",
      area: (page?.suburb || "").split(/[,/•|;]/)[0].trim() || "your area",
      address: address || "your home",
      agent_name: agentName,
      agent_phone: prettyPhone(page?.phone || this.profile?.whatsapp_number || ""),
      appointment: appointmentLabel(l.appointment_at),
      whatsapp_link: `${APP}/w/${l.id}`,
    };
    const uses = (f: string) => new RegExp(`\\{\\{\\s*${f}\\s*\\}\\}`).test(`${step.subject}\n${step.body}`);
    if (uses("plan_link")) fields.plan_link = await this.planLink(l);
    if (uses("recent_sales")) fields.recent_sales = await this.recentSales(l);
    // The form's lead magnet, drawn as a box below. None for this form: nothing.
    let magnet: (Magnet & { url: string }) | null = null;
    if (uses("lead_magnet")) {
      const m = resolveMagnet(page, await this.pipelineKind());
      if (m) magnet = { ...m, url: await this.planLink(l) };
      fields.lead_magnet = magnet ? MAGNET_MARK : "";
    }
    const subject = fill(step.subject, { ...fields, lead_magnet: magnet?.title ?? "" }).replace(/\s+/g, " ").trim().slice(0, 200);
    // Paragraphs left empty by a field with nothing to show are dropped.
    const paras = fill(step.body, fields).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

    const { data: rec, error: recErr } = await this.supabase
      .from("workflow_emails")
      .insert({ run_id: this.run.id, lead_id: l.id, agent_id: l.agent_id, subject })
      .select("id")
      .single();
    if (recErr || !rec) throw new Error(`email record: ${recErr?.message}`);

    const unsub = await unsubscribeUrl(l.id);
    const linkify = (t: string) => esc(t).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#1a73e8">${u}</a>`);
    const magnetText = magnet ? [magnet.title.toUpperCase(), ...(magnet.text ? [magnet.text] : []), `${magnet.button}: ${magnet.url}`].join("\n") : "";
    const magnetHtml = magnet
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:4px 0 18px;border-collapse:collapse"><tr><td style="border-left:4px solid #1565c0;background:#eef4fc;padding:14px 16px">
<p style="margin:0 0 6px;font-size:16px;font-weight:bold;color:#111111;line-height:1.35">${esc(magnet.title)}</p>
${magnet.text ? `<p style="margin:0 0 8px">${esc(magnet.text)}</p>` : ""}
<p style="margin:10px 0 0"><a href="${esc(magnet.url)}" style="color:#1565c0;font-weight:bold;font-size:16px">${esc(magnet.button)} &rarr;</a></p>
</td></tr></table>`
      : "";
    const htmlPara = (p: string) => (p === MAGNET_MARK ? magnetHtml : `<p style="margin:0 0 14px">${linkify(p.split(MAGNET_MARK).join(magnetText)).replace(/\n/g, "<br>")}</p>`);
    const body = paras.map((p) => p.split(MAGNET_MARK).join(magnetText)).join("\n\n");
    const html = `<!doctype html><html><body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222222">
<div style="max-width:560px">
${paras.map(htmlPara).join("\n")}
<p style="margin:28px 0 0;font-size:11px;color:#999999;line-height:1.5">
You're getting this because you asked ${esc(agentName)} about your property. <a href="${unsub}" style="color:#999999">Unsubscribe</a>
</p>
<img src="${APP}/oe/${rec.id}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">
</div></body></html>`;
    const text = `${body}\n\n--\nYou're getting this because you asked ${agentName} about your property. Unsubscribe: ${unsub}`;
    const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.profile?.email || "") ? this.profile!.email! : undefined;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${agentName.replace(/["<>]/g, "")} <${FROM_ADDRESS}>`,
        to: [to],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        html,
        text,
        headers: { "List-Unsubscribe": `<${unsub}>` },
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      console.error("workflow email failed", res.status, detail);
      await this.supabase.from("workflow_emails").delete().eq("id", rec.id);
      await log(this.supabase, this.run, step.id, "Email the lead", "Failed", `The email service said ${res.status}`);
      return { kind: "done" };
    }
    try {
      const resendId = (JSON.parse(await res.text()) as { id?: string }).id;
      // Delivery reports (delivered, bounced, spam) match on this.
      if (resendId) await this.supabase.from("workflow_emails").update({ resend_id: resendId }).eq("id", rec.id);
    } catch { /* sent anyway; only its later reports won't match */ }
    this.run.last_email_id = rec.id;
    await save(this.supabase, this.run, { last_email_id: rec.id });
    await log(this.supabase, this.run, step.id, "Email the lead", "Sent", subject);
    await this.supabase.from("lead_events").insert({
      lead_id: l.id, agent_id: l.agent_id, event_type: "workflow_email", from_value: this.wfName, to_value: subject, source: "automation",
    });
    return { kind: "done" };
  }

  private async setStage(step: Extract<Step, { type: "set_stage" }>): Promise<Outcome> {
    const l = this.lead;
    if (!l) return { kind: "done" };
    if (l.stage !== step.stage) {
      // Our own move mustn't count as "the stage changed": move the baseline first.
      this.run.start_stage = step.stage;
      await save(this.supabase, this.run, { start_stage: step.stage });
      const { error } = await this.supabase.from("leads").update({ stage: step.stage }).eq("id", l.id);
      if (error) throw new Error(`set stage: ${error.message}`);
      l.stage = step.stage;
    }
    await log(this.supabase, this.run, step.id, "Move stage", "Done", step.stage);
    return { kind: "done" };
  }

  private async reminder(step: Extract<Step, { type: "reminder" }>): Promise<Outcome> {
    const l = this.lead;
    if (!l) return { kind: "done" };
    // A booked lead's reminder time IS the appointment (the diary reads it
    // there): never overwrite an appointment still to come.
    if (l.appointment_at && new Date(l.appointment_at).getTime() > Date.now()) {
      await log(this.supabase, this.run, step.id, "Set reminder", "Skipped", `The lead has an appointment (${appointmentLabel(l.appointment_at)}); it stays as it is`);
      return { kind: "done" };
    }
    const label = fill(step.label, { first_name: first(l.name) || l.name, name: l.name }).slice(0, 120);
    const at = new Date(Date.now() + Math.max(0, step.inDays) * 86_400_000);
    const { error } = await this.supabase.from("leads").update({ next_label: label, reminder_at: at.toISOString(), due: true }).eq("id", l.id);
    if (error) throw new Error(`reminder: ${error.message}`);
    l.next_label = label;
    await log(this.supabase, this.run, step.id, "Set reminder", "Done", label);
    return { kind: "done" };
  }

  private async tag(step: Extract<Step, { type: "tag" }>): Promise<Outcome> {
    const l = this.lead;
    if (!l) return { kind: "done" };
    const tag = step.tag.trim().slice(0, 40);
    const tags = l.tags ?? [];
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      const nextTags = [...tags, tag];
      const { error } = await this.supabase.from("leads").update({ tags: nextTags }).eq("id", l.id);
      if (error) throw new Error(`tag: ${error.message}`);
      l.tags = nextTags;
      await this.supabase.from("lead_events").insert({
        lead_id: l.id, agent_id: l.agent_id, event_type: "tagged", from_value: this.wfName, to_value: tag, source: "automation",
      });
    }
    await log(this.supabase, this.run, step.id, "Add tag", "Done", tag);
    return { kind: "done" };
  }
}
