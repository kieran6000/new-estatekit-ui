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

/**
 * Never throws.
 *
 * End pages are an optional extra on top of a form that works without them, so
 * a read failure must not take the editor or the live landing page down with
 * it. That matters most before the migration has been applied: the table
 * genuinely doesn't exist yet, and every page that asks for endings would
 * otherwise break. Returning an empty list degrades to "no custom endings",
 * which is exactly right.
 */
export async function listEndings(pageId: string): Promise<PageEnding[]> {
  // Skip the request entirely when the table isn't there, rather than firing a
  // 404 from every component that wants endings.
  if (!(await endingsAvailable())) return [];
  const { data, error } = await supabase
    .from("lead_page_endings")
    .select("id, page_id, name, headline, subtext, outcome, sort_order")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Couldn't load end pages", error.message);
    return [];
  }
  return (data ?? []).map((r) => toEnding(r as EndingRow));
}

/**
 * Whether the endings table exists at all.
 *
 * Probed once per app load and shared by every caller — several components ask
 * for endings, and without this each one produced its own 404 on a database
 * that hasn't had the migration applied. One line in the console, not a wall.
 */
let availability: Promise<boolean> | null = null;

export function endingsAvailable(): Promise<boolean> {
  if (!availability) {
    availability = (async () => {
      const { error } = await supabase.from("lead_page_endings").select("id").limit(1);
      if (error) console.warn("End pages aren't set up on this database yet:", error.message);
      return !error;
    })();
  }
  return availability;
}

/** Public read for the live landing page — no session, and never throws: a
 *  visitor's form must keep working whatever happens here. */
export async function listEndingsPublic(pageId: string): Promise<PageEnding[]> {
  if (!(await endingsAvailable())) return [];
  const { data, error } = await supabase
    .from("lead_page_endings")
    .select("id, page_id, name, headline, subtext, outcome, sort_order")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Couldn't load end pages", error.message);
    return [];
  }
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
