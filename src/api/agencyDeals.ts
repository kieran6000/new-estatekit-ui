import { supabase } from "./_client";

// agency_deals: the sales facts for a prospect in our own "EstateKit Agents"
// pipeline — the discovery scorecard, the call summary and a next action.
// One row per lead, operator-only by RLS. It sits NEXT TO the lead; the lead
// itself is worked exactly like any other (same stages, call list, reminders).
// Table: supabase/migrations/20261116_0001_agency_deals.sql.

export interface AgencyDeal {
  id: string;
  lead_id: string | null;
  leads_per_month: number | null;
  deals_per_month: number | null;
  tried_before: string | null;
  tried_before_cost: string | null;
  budget: string | null;
  target_suburbs: string | null;
  decision_date: string | null;
  scorecard_notes: string | null;
  fathom_url: string | null;
  fathom_summary: string | null;
  next_action_at: string | null;
  next_action_reason: string | null;
}

export type AgencyDealPatch = Partial<Omit<AgencyDeal, "id" | "lead_id">>;

const COLUMNS =
  "id, lead_id, leads_per_month, deals_per_month, tried_before, tried_before_cost, budget, target_suburbs, decision_date, scorecard_notes, fathom_url, fathom_summary, next_action_at, next_action_reason";

/** Thrown when the table isn't there yet (migration still pending). */
export class AgencyDealsNotSetUp extends Error {}

function notSetUp(error: { message: string; code?: string }): boolean {
  return /does not exist|schema cache|42P01|PGRST205/i.test(`${error.message} ${error.code ?? ""}`);
}

/** The deal row for a lead, or null if there isn't one yet. */
export async function getAgencyDealByLead(leadId: string): Promise<AgencyDeal | null> {
  const { data, error } = await supabase.from("agency_deals").select(COLUMNS).eq("lead_id", leadId).maybeSingle();
  if (error) {
    if (notSetUp(error)) throw new AgencyDealsNotSetUp(error.message);
    throw new Error(error.message);
  }
  return (data as AgencyDeal | null) ?? null;
}

/**
 * Save scorecard / call / next-action edits for a lead's deal. Updates the
 * existing row, or creates one the first time (new agency leads that arrived
 * after the backfill have no row yet).
 */
export async function saveAgencyDealForLead(leadId: string, existingId: string | null, patch: AgencyDealPatch): Promise<void> {
  const { error } = existingId
    ? await supabase.from("agency_deals").update(patch).eq("id", existingId)
    : await supabase.from("agency_deals").insert({ lead_id: leadId, ...patch });
  if (error) {
    console.error("agency_deals save failed:", error.message);
    throw new Error("That didn't save. Try again.");
  }
}
