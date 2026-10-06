import { supabase } from "./_client";
import type { AccountVocab } from "../lib/workflow";
import type { PipelineKind } from "../types";

/** An account's pipelines, forms and lead tags, for the workflow builder's
 *  pick lists (lib/workflow.ts → setAccountVocab). */
export async function getAccountVocab(agentId: string): Promise<AccountVocab> {
  const [pl, pages, tagged] = await Promise.all([
    supabase.from("pipelines").select("id, name, kind").eq("agent_id", agentId).order("created_at", { ascending: true }),
    supabase.from("lead_pages").select("id, name").eq("agent_id", agentId).order("created_at", { ascending: true }),
    supabase.from("leads").select("tags").eq("agent_id", agentId).not("tags", "eq", "{}").limit(1000),
  ]);
  if (pl.error) throw new Error(pl.error.message);
  if (pages.error) throw new Error(pages.error.message);
  const tags = new Set<string>();
  for (const r of (tagged.data ?? []) as { tags: string[] | null }[]) for (const t of r.tags ?? []) if (t.trim()) tags.add(t.trim());
  return {
    pipelines: (pl.data ?? []).map((p) => ({ id: p.id as string, name: p.name as string, kind: p.kind as PipelineKind })),
    forms: (pages.data ?? []).map((p) => ({ id: p.id as string, name: p.name as string })),
    tags: [...tags],
  };
}
