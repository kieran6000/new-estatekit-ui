import { supabase } from "./_client";
import { DEAL_STAGE_STAMP, type DealStage } from "../lib/dealStage";

// agency_deals: our own sales pipeline (the EstateKit-acquires-a-client funnel).
// Operator-only by RLS. One row per prospect, joined to the lead it came from
// and, once they sign, to the agent_profiles account they became.
// Table + columns: supabase/migrations/20261116_0001_agency_deals.sql.

export interface AgencyDealRow {
  id: string;
  lead_id: string | null;
  signup_request_id: string | null;
  agent_id: string | null;
  stage: DealStage;

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
  lost_reason: string | null;
  pricing_plan: string;

  contract_id: string | null;
  invoice_id: string | null;

  applied_at: string;
  call_booked_at: string | null;
  call_at: string | null;
  showed_at: string | null;
  no_show_at: string | null;
  proposal_sent_at: string | null;
  signed_at: string | null;
  paid_at: string | null;
  live_at: string | null;
  renewal_due_at: string | null;
  churned_at: string | null;
  lost_at: string | null;

  created_at: string;
  updated_at: string;
}

/** The applicant's name/phone, read across from the lead or sign-up so the
 *  Sales board can show who a deal is without a second query. Filled by the
 *  joins below. */
export interface AgencyDeal extends AgencyDealRow {
  name: string;
  phone: string | null;
  email: string | null;
  agency: string | null;
  area: string | null;
  /** The lead's PPRA/transactions answers, when it came from /pitch. */
  form_answers: { q: string; a: string }[];
  lead_stage: string | null;
}

/** Thrown when the table isn't there yet (migration still pending). The Sales
 *  page shows a "run the migration" message instead of a crash. */
export class AgencyDealsNotSetUp extends Error {}

const COLUMNS =
  "id, lead_id, signup_request_id, agent_id, stage, leads_per_month, deals_per_month, tried_before, tried_before_cost, budget, target_suburbs, decision_date, scorecard_notes, fathom_url, fathom_summary, next_action_at, next_action_reason, lost_reason, pricing_plan, contract_id, invoice_id, applied_at, call_booked_at, call_at, showed_at, no_show_at, proposal_sent_at, signed_at, paid_at, live_at, renewal_due_at, churned_at, lost_at, created_at, updated_at";

function notSetUp(error: { message: string; code?: string }): boolean {
  return /does not exist|schema cache|42P01|PGRST205/i.test(`${error.message} ${error.code ?? ""}`);
}

/** Every deal, newest first, with the applicant's details joined in. */
export async function listAgencyDeals(): Promise<AgencyDeal[]> {
  const { data, error } = await supabase
    .from("agency_deals")
    .select(
      `${COLUMNS},
       lead:leads ( name, phone, email, stage, form_answers ),
       signup:signup_requests ( name, whatsapp, email, agency ),
       agent:agent_profiles ( display_name, whatsapp_number, email, company, area )`,
    )
    .order("applied_at", { ascending: false })
    .limit(2000);

  if (error) {
    if (notSetUp(error)) throw new AgencyDealsNotSetUp(error.message);
    throw new Error(error.message);
  }

  return (data ?? []).map((r) => {
    // One of lead / signup / agent is the source of the name; prefer the most
    // advanced (agent) so a signed client shows their account name.
    const lead = (r as Record<string, unknown>).lead as
      | { name?: string; phone?: string; email?: string; stage?: string; form_answers?: { q: string; a: string }[] }
      | null;
    const signup = (r as Record<string, unknown>).signup as
      | { name?: string; whatsapp?: string; email?: string; agency?: string }
      | null;
    const agent = (r as Record<string, unknown>).agent as
      | { display_name?: string; whatsapp_number?: string; email?: string; company?: string; area?: string }
      | null;

    return {
      ...(r as unknown as AgencyDealRow),
      name: agent?.display_name || lead?.name || signup?.name || "Unknown",
      phone: agent?.whatsapp_number || lead?.phone || signup?.whatsapp || null,
      email: agent?.email || lead?.email || signup?.email || null,
      agency: agent?.company || signup?.agency || null,
      area: agent?.area || null,
      form_answers: Array.isArray(lead?.form_answers) ? lead!.form_answers! : [],
      lead_stage: lead?.stage ?? null,
    };
  });
}

type DealPatch = Partial<
  Pick<
    AgencyDealRow,
    | "leads_per_month"
    | "deals_per_month"
    | "tried_before"
    | "tried_before_cost"
    | "budget"
    | "target_suburbs"
    | "decision_date"
    | "scorecard_notes"
    | "fathom_url"
    | "fathom_summary"
    | "next_action_at"
    | "next_action_reason"
    | "lost_reason"
    | "pricing_plan"
    | "contract_id"
    | "invoice_id"
    | "agent_id"
    | "call_at"
  >
>;

/** Save scorecard / call / follow-up edits. */
export async function updateAgencyDeal(id: string, patch: DealPatch): Promise<void> {
  const { error } = await supabase.from("agency_deals").update(patch).eq("id", id);
  if (error) {
    console.error("agency_deals update failed:", error.message);
    throw new Error("That didn't save. Try again.");
  }
}

/**
 * Move a deal to a new stage. Stamps the stage's milestone column the first
 * time it's reached (never overwrites an earlier timestamp), so show-rate and
 * time-to-sign stay honest even if a deal is nudged back and forth.
 * `current` is the row as last loaded, to know which stamps are already set.
 */
export async function moveAgencyDeal(
  deal: Pick<AgencyDealRow, "id"> & Partial<AgencyDealRow>,
  stage: DealStage,
): Promise<void> {
  const patch: Record<string, unknown> = { stage };
  const stamp = DEAL_STAGE_STAMP[stage];
  if (stamp && !(deal as Record<string, unknown>)[stamp]) {
    patch[stamp] = new Date().toISOString();
  }
  const { error } = await supabase.from("agency_deals").update(patch).eq("id", deal.id);
  if (error) {
    console.error("agency_deals move failed:", error.message);
    throw new Error("Couldn't move the deal. Try again.");
  }
}
