import { supabase, getCurrentUserId } from "./_client";
import type { Workflow } from "../lib/workflow";

// Saved workflows (Automations → Workflows). Each account has its own; the
// shared template library has no account. Staff only (RLS). The engine that
// runs them is supabase/functions/run-automations/workflows.ts.

interface WorkflowRowDb {
  id: string;
  agent_id: string | null;
  is_template: boolean;
  name: string;
  published: boolean;
  definition: Pick<Workflow, "trigger" | "filters" | "steps" | "exits" | "settings">;
  updated_at: string;
  standard: boolean;
  standard_on: boolean;
}

const COLS = "id, agent_id, is_template, name, published, definition, updated_at, standard, standard_on";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Saved yet? New workflows have a temporary id until their first save. */
export const isSaved = (id: string) => UUID.test(id);

function fromRow(r: WorkflowRowDb): Workflow {
  const d = r.definition;
  return {
    id: r.id,
    name: r.name,
    published: r.published,
    trigger: d.trigger,
    filters: d.filters ?? [],
    steps: d.steps ?? [],
    exits: d.exits ?? [],
    settings: d.settings,
    updatedAt: r.updated_at,
    ...(r.is_template ? { standard: r.standard ? (r.standard_on ? "on" : "off") : "no" } as const : {}),
  };
}

const definitionOf = (w: Workflow) => ({ trigger: w.trigger, filters: w.filters, steps: w.steps, exits: w.exits, settings: w.settings });

export async function listAccountWorkflows(agentId: string): Promise<Workflow[]> {
  const { data, error } = await supabase.from("workflows").select(COLS).eq("agent_id", agentId).order("created_at");
  if (error) throw new Error(error.message);
  return (data as WorkflowRowDb[]).map(fromRow);
}

export interface OpenedWorkflow {
  workflow: Workflow;
  /** The account it belongs to; null for a template. */
  agentId: string | null;
}

/** One workflow or template by id, whichever account it's on (an address
 *  like /admin/automations/workflows/<id> must open the same thing for
 *  anyone, after a refresh too). null when it doesn't exist. */
export async function getWorkflow(id: string): Promise<OpenedWorkflow | null> {
  if (!isSaved(id)) return null;
  const { data, error } = await supabase.from("workflows").select(COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as WorkflowRowDb;
  return { workflow: fromRow(r), agentId: r.is_template ? null : r.agent_id };
}

export async function listTemplateWorkflows(): Promise<Workflow[]> {
  const { data, error } = await supabase.from("workflows").select(COLS).eq("is_template", true).order("name");
  if (error) throw new Error(error.message);
  return (data as WorkflowRowDb[]).map(fromRow);
}

/** Saves a workflow for an account (`agentId`), or to the template library
 *  (`agentId` null). Returns it as saved, with its permanent id. */
export async function saveWorkflow(w: Workflow, agentId: string | null): Promise<Workflow> {
  const row = {
    name: w.name.trim() || "Untitled workflow",
    // Templates never run, so they're never "on".
    published: agentId ? w.published : false,
    definition: definitionOf(w),
    updated_at: new Date().toISOString(),
    updated_by: await getCurrentUserId(),
    // Templates only: whether new accounts get a copy, switched on or off.
    ...(!agentId && w.standard ? { standard: w.standard !== "no", standard_on: w.standard === "on" } : {}),
  };
  const q = isSaved(w.id)
    ? supabase.from("workflows").update(row).eq("id", w.id)
    : supabase.from("workflows").insert({ ...row, agent_id: agentId, is_template: !agentId });
  const { data, error } = await q.select(COLS).single();
  if (error) throw new Error(error.message);
  return fromRow(data as WorkflowRowDb);
}

export async function deleteWorkflow(id: string): Promise<void> {
  if (!isSaved(id)) return;
  const { error } = await supabase.from("workflows").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Gives an account a copy of each standard template it doesn't have yet
 *  (what every new account gets). Returns how many were added. */
export async function addStandardWorkflows(agentId: string): Promise<number> {
  const { data, error } = await supabase.rpc("add_standard_workflows", { p_agent: agentId });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export interface WorkflowLogRow {
  id: number;
  at: string;
  what: string;
  status: string;
  detail: string | null;
  lead_id: string | null;
  lead: { name: string } | null;
}

/** What a workflow has done, newest first (its History tab). */
export async function listWorkflowLog(workflowId: string): Promise<WorkflowLogRow[]> {
  const { data, error } = await supabase
    .from("workflow_log")
    .select("id, at, what, status, detail, lead_id, lead:leads(name)")
    .eq("workflow_id", workflowId)
    .order("at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return data as unknown as WorkflowLogRow[];
}

export interface WorkflowRunRow {
  id: string;
  run_at: string;
  status: "pending" | "processing" | "paused";
  pos: (number | string)[];
  workflow: { id: string; name: string; definition: WorkflowRowDb["definition"] } | null;
  lead: { id: string; name: string; agent_id: string } | null;
  agent_id: string;
}

/** Workflow runs that are waiting or held, soonest first (Scheduled tab). */
export async function listScheduledWorkflowRuns(agentId: string | null): Promise<WorkflowRunRow[]> {
  let q = supabase
    .from("workflow_runs")
    .select("id, run_at, status, pos, agent_id, workflow:workflows(id, name, definition), lead:leads(id, name, agent_id)")
    .in("status", ["pending", "processing", "paused"]);
  if (agentId) q = q.eq("agent_id", agentId);
  const { data, error } = await q.order("run_at", { ascending: true }).limit(200);
  if (error) throw new Error(error.message);
  return data as unknown as WorkflowRunRow[];
}

export interface LeadInWorkflow {
  id: string;
  run_at: string;
  status: "pending" | "processing" | "paused";
  pos: (number | string)[];
  started: boolean;
  lead: { id: string; name: string; stage: string | null } | null;
}

/** The leads in a workflow right now (waiting for their next step, or
 *  paused), soonest first. Finished ones are in its history. */
export async function listWorkflowRuns(workflowId: string): Promise<LeadInWorkflow[]> {
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("id, run_at, status, pos, started, lead:leads(id, name, stage)")
    .eq("workflow_id", workflowId)
    .in("status", ["pending", "processing", "paused"])
    .order("run_at", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return data as unknown as LeadInWorkflow[];
}

/** How many leads are in each of an account's workflows right now. */
export async function countLeadsInWorkflows(agentId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("workflow_id")
    .eq("agent_id", agentId)
    .in("status", ["pending", "processing", "paused"])
    .limit(10000);
  if (error) throw new Error(error.message);
  const out: Record<string, number> = {};
  for (const r of data as { workflow_id: string }[]) out[r.workflow_id] = (out[r.workflow_id] ?? 0) + 1;
  return out;
}

export async function updateWorkflowRun(id: string, patch: { status?: "pending" | "paused" | "cancelled"; run_at?: string }): Promise<void> {
  const { error } = await supabase.from("workflow_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}
