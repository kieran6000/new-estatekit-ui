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
}

const COLS = "id, agent_id, is_template, name, published, definition, updated_at";
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
  };
}

const definitionOf = (w: Workflow) => ({ trigger: w.trigger, filters: w.filters, steps: w.steps, exits: w.exits, settings: w.settings });

export async function listAccountWorkflows(agentId: string): Promise<Workflow[]> {
  const { data, error } = await supabase.from("workflows").select(COLS).eq("agent_id", agentId).order("created_at");
  if (error) throw new Error(error.message);
  return (data as WorkflowRowDb[]).map(fromRow);
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

/** Whether the account has switched from the shared Setup automations to its
 *  own workflows. */
export async function getUsesWorkflows(agentId: string): Promise<boolean> {
  const { data, error } = await supabase.from("agent_profiles").select("uses_workflows").eq("agent_id", agentId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.uses_workflows === true;
}

export async function setUsesWorkflows(agentId: string, on: boolean): Promise<void> {
  const { error } = await supabase.from("agent_profiles").update({ uses_workflows: on }).eq("agent_id", agentId);
  if (error) throw new Error(error.message);
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

export async function updateWorkflowRun(id: string, patch: { status?: "pending" | "paused" | "cancelled"; run_at?: string }): Promise<void> {
  const { error } = await supabase.from("workflow_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}
