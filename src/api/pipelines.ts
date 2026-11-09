import { supabase, getActiveAgentId } from "./_client";
import type { Pipeline, PipelineKind } from "../types";

export async function listPipelines(): Promise<Pipeline[]> {
  const agentId = await getActiveAgentId();
  const { data, error } = await supabase
    .from("pipelines")
    .select("id, name, kind, sheet_url")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data as Pipeline[];
}

export async function getPipelinePublic(id: string): Promise<Pipeline | null> {
  const { data, error } = await supabase
    .from("pipelines")
    .select("id, name, kind, sheet_url")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Pipeline | null;
}

export async function addPipeline(
  name: string,
  kind: PipelineKind,
): Promise<Pipeline> {
  const agentId = await getActiveAgentId();
  const { data, error } = await supabase
    .from("pipelines")
    .insert({ agent_id: agentId, name, kind })
    .select("id, name, kind, sheet_url")
    .single();
  if (error) throw new Error(error.message);
  return data as Pipeline;
}

export async function renamePipeline(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("pipelines").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function syncPipelineSheet(pipelineId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("sync-pipeline-sheet", {
    body: { pipeline_id: pipelineId },
  });
  if (error) throw new Error(error.message);
  return data.sheet_url as string;
}

/** How many leads and forms a pipeline has (they move if it's deleted). */
export async function pipelineUsage(id: string): Promise<{ leads: number; forms: number }> {
  const [l, f] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("pipeline_id", id),
    supabase.from("lead_pages").select("id", { count: "exact", head: true }).eq("pipeline_id", id),
  ]);
  if (l.error) throw new Error(l.error.message);
  if (f.error) throw new Error(f.error.message);
  return { leads: l.count ?? 0, forms: f.count ?? 0 };
}

/** Deletes a pipeline, moving its leads, forms and workflow checks to moveTo
 *  first (the delete_pipeline database function does it all at once). */
export async function deletePipeline(id: string, moveTo: string | null): Promise<void> {
  const { error } = await supabase.rpc("delete_pipeline", { p_id: id, p_move_to: moveTo });
  if (error) throw new Error(error.message);
}

// Pipelines shared with the team: staff see them on their Leads tab and can
// work their leads. The list of shared pipeline ids is one app setting.
const TEAM_KEY = "team_pipelines";

async function teamPipelineIds(): Promise<string[]> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", TEAM_KEY).maybeSingle();
  try {
    const ids = JSON.parse(data?.value ?? "[]");
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export interface TeamPipeline extends Pipeline { agent_id: string; owner: string }

/** Every pipeline shared with the team, with whose account it's in. */
export async function listTeamPipelines(): Promise<TeamPipeline[]> {
  const ids = await teamPipelineIds();
  if (!ids.length) return [];
  const { data, error } = await supabase.from("pipelines").select("id, name, kind, sheet_url, agent_id").in("id", ids);
  if (error) throw new Error(error.message);
  const owners = [...new Set((data ?? []).map((p) => p.agent_id as string))];
  const { data: profiles } = await supabase.from("agent_profiles").select("agent_id, display_name").in("agent_id", owners);
  const nameOf = new Map((profiles ?? []).map((p) => [p.agent_id as string, (p.display_name as string | null) ?? ""]));
  return ((data ?? []) as (Pipeline & { agent_id: string })[]).map((p) => ({ ...p, owner: nameOf.get(p.agent_id) || "" }));
}

/** Shares a pipeline with the team, or stops sharing it. */
export async function setPipelineShared(id: string, shared: boolean): Promise<void> {
  const ids = (await teamPipelineIds()).filter((x) => x !== id);
  if (shared) ids.push(id);
  const { error } = await supabase.from("app_settings").upsert({ key: TEAM_KEY, value: JSON.stringify(ids), updated_at: new Date().toISOString() });
  if (error) {
    console.error("setPipelineShared failed:", error.message);
    throw new Error("Couldn't save that. Try again.");
  }
}
