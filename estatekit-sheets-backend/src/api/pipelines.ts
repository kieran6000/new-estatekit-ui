import { callApi } from "./_client";
import type { Pipeline, PipelineKind } from "../types";

export async function listPipelines(): Promise<Pipeline[]> {
  return callApi<Pipeline[]>("pipelines.list");
}

export async function addPipeline(name: string, kind: PipelineKind): Promise<Pipeline> {
  return callApi<Pipeline>("pipelines.add", { name, kind });
}
