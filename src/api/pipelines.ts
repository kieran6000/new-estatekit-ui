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
