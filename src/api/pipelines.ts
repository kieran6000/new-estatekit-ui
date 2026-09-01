import { getStore, setStore, uid } from "./_store";
import type { Pipeline, PipelineKind } from "../types";

const KEY = "pipelines";

function seedPipelines(): Pipeline[] {
  return [
    { id: "pipeline-seller", name: "Seller", kind: "seller" },
    { id: "pipeline-buyer", name: "Buyer", kind: "buyer" },
  ];
}

// TODO: connect backend — replace with a real `select * from pipelines` call.
export async function listPipelines(): Promise<Pipeline[]> {
  return getStore<Pipeline[]>(KEY, seedPipelines());
}

// TODO: connect backend — replace with a real insert. A pipeline is always a
// preset (seller-style or buyer-style) + a name — there is no stage editor.
export async function addPipeline(name: string, kind: PipelineKind): Promise<Pipeline> {
  const rows = await listPipelines();
  const row: Pipeline = { id: uid(), name, kind };
  setStore(KEY, [...rows, row]);
  return row;
}
