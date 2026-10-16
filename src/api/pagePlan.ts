import { supabase } from "./_client";

/** The general marketing plan for a form (get_page_plan): the agent's public
 *  details and recent sales, no lead, nothing logged. For people who reach the
 *  thank-you page from a Facebook instant form's end button. */
export interface PagePlan {
  lead_id: string;
  lead_name: string;
  address: string;
  reason: string;
  timeline: string;
  date: string;
  agent_name: string;
  company: string;
  agent_email: string;
  agent_phone: string;
  photo: string | null;
  accent: string;
  page_slug: string | null;
  sales: { address: string; price: number | null; status: string; image_url: string | null }[];
  /** "seller", "buyer" or "general": decides the default lead magnet. */
  pipeline_kind: string;
}

export async function getPagePlan(slug: string): Promise<PagePlan | null> {
  const { data, error } = await supabase.rpc("get_page_plan", { p_slug: slug });
  if (error) throw new Error(error.message);
  return (data as PagePlan) ?? null;
}
