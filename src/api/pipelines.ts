import { supabase, getCurrentUserId, getActiveAgentId } from "./_client";
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
  const agentId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("pipelines")
    .insert({ agent_id: agentId, name, kind })
    .select("id, name, kind, sheet_url")
    .single();
  if (error) throw new Error(error.message);
  return data as Pipeline;
}

export async function syncPipelineSheet(pipelineId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("sync-pipeline-sheet", {
    body: { pipeline_id: pipelineId },
  });
  if (error) throw new Error(error.message);
  return data.sheet_url as string;
}
