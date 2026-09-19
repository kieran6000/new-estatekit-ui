import { supabase, getActiveAgentId } from "./_client";

/**
 * What an end page does when someone lands on it. One choice instead of a set
 * of independent switches, because every real-world combination is one of
 * these three and a matrix of checkboxes is how this gets confusing.
 */
export type EndingOutcome = "lead" | "quiet_lead" | "no_lead";

export interface PageEnding {
  id: string;
  pageId: string;
  name: string;
  headline: string;
  subtext: string;
  outcome: EndingOutcome;
  order: number;
}

/** The two endings every page has without creating anything. They aren't rows —
 *  routes point at them by these fixed ids. */
export const BUILT_IN_ENDINGS = {
  thanks: "end:thanks",
  notAFit: "end:not_a_fit",
} as const;

interface EndingRow {
  id: string;
  page_id: string;
  name: string;
  headline: string;
  subtext: string;
  outcome: string;
  sort_order: number;
}

function toEnding(r: EndingRow): PageEnding {
  return {
    id: r.id,
    pageId: r.page_id,
    name: r.name,
    headline: r.headline,
    subtext: r.subtext,
    outcome: r.outcome as EndingOutcome,
    order: r.sort_order,
  };
}

export async function listEndings(pageId: string): Promise<PageEnding[]> {
  const { data, error } = await supabase
    .from("lead_page_endings")
    .select("id, page_id, name, headline, subtext, outcome, sort_order")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toEnding(r as EndingRow));
}

/** Public read for the live landing page — no session. */
export async function listEndingsPublic(pageId: string): Promise<PageEnding[]> {
  const { data } = await supabase
    .from("lead_page_endings")
    .select("id, page_id, name, headline, subtext, outcome, sort_order")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => toEnding(r as EndingRow));
}

export async function addEnding(pageId: string, name: string): Promise<PageEnding> {
  const agentId = await getActiveAgentId();
  const existing = await listEndings(pageId);
  const { data, error } = await supabase
    .from("lead_page_endings")
    .insert({
      page_id: pageId,
      agent_id: agentId,
      name,
      headline: "Thanks!",
      subtext: "",
      outcome: "lead",
      sort_order: existing.length,
    })
    .select("id, page_id, name, headline, subtext, outcome, sort_order")
    .single();
  if (error) throw new Error(error.message);
  return toEnding(data as EndingRow);
}

export async function updateEnding(
  id: string,
  patch: Partial<Pick<PageEnding, "name" | "headline" | "subtext" | "outcome">>,
): Promise<void> {
  const { error } = await supabase.from("lead_page_endings").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteEnding(id: string): Promise<void> {
  const { error } = await supabase.from("lead_page_endings").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
