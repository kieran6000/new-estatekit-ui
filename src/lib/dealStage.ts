// The agency sales lifecycle, in one place — the same idea as stageLogic.ts
// for leads, but for OUR deals (agency_deals): turning an applicant into a
// paying client. This never touches the lead stage engine; it only describes
// the post-first-contact stages a deal moves through and what each one stamps.

export type DealStage =
  | "applied"
  | "call_booked"
  | "showed"
  | "no_show"
  | "proposal_sent"
  | "signed"
  | "paid"
  | "live"
  | "renewal_due"
  | "churned"
  | "lost";

/** The order they appear on the board, left to right. */
export const DEAL_STAGE_ORDER: DealStage[] = [
  "applied",
  "call_booked",
  "showed",
  "proposal_sent",
  "signed",
  "paid",
  "live",
  "renewal_due",
];

/** Off-board outcomes, shown apart from the forward flow. */
export const DEAL_DEAD_STAGES: DealStage[] = ["no_show", "churned", "lost"];

export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  applied: "Applied",
  call_booked: "Call booked",
  showed: "Showed",
  no_show: "No-show",
  proposal_sent: "Proposal sent",
  signed: "Signed",
  paid: "Paid",
  live: "Live",
  renewal_due: "Renewal due",
  churned: "Churned",
  lost: "Lost",
};

/** A one-line description for the stage header, so the board explains itself. */
export const DEAL_STAGE_HINT: Record<DealStage, string> = {
  applied: "Came in, not on a call yet",
  call_booked: "Discovery call scheduled",
  showed: "Turned up to the call",
  no_show: "Booked but didn't show",
  proposal_sent: "Plan and price sent",
  signed: "Contract signed",
  paid: "First invoice paid",
  live: "Campaign is running",
  renewal_due: "Contract ends within 30 days",
  churned: "Client has left",
  lost: "Didn't become a client",
};

/** Token colour name for each stage's dot/chip (resolved in the component so
 *  dark mode works). Won = green, warm = blue/amber, dead = red/grey. */
export const DEAL_STAGE_TONE: Record<DealStage, "grey" | "blue" | "amber" | "green" | "red"> = {
  applied: "grey",
  call_booked: "blue",
  showed: "blue",
  no_show: "red",
  proposal_sent: "amber",
  signed: "green",
  paid: "green",
  live: "green",
  renewal_due: "amber",
  churned: "red",
  lost: "red",
};

/** Stages that mean "a paying, onboarded or active client" — used by Phase 4. */
export const DEAL_CLIENT_STAGES: DealStage[] = ["paid", "live", "renewal_due"];

/** The milestone timestamp column a stage stamps the first time it's reached.
 *  Mirrors the agency_deals columns; the API only sets one if it's still null,
 *  so the first time each milestone happened is preserved. */
export const DEAL_STAGE_STAMP: Record<DealStage, string | null> = {
  applied: "applied_at",
  call_booked: "call_booked_at",
  showed: "showed_at",
  no_show: "no_show_at",
  proposal_sent: "proposal_sent_at",
  signed: "signed_at",
  paid: "paid_at",
  live: "live_at",
  renewal_due: "renewal_due_at",
  churned: "churned_at",
  lost: "lost_at",
};

/**
 * Show rate = of the deals that booked a call, how many turned up.
 * A deal counts as "booked" once it reached call_booked (we have the
 * timestamp), and as "showed" once it reached showed/proposal_sent/…/live
 * (anything past the call), or was explicitly a no_show on the other side.
 */
export function showRate(deals: { call_booked_at: string | null; showed_at: string | null; stage: DealStage }[]): {
  booked: number;
  showed: number;
  rate: number | null;
} {
  const booked = deals.filter((d) => d.call_booked_at);
  const showed = booked.filter(
    (d) => d.showed_at || ["showed", "proposal_sent", "signed", "paid", "live", "renewal_due", "churned"].includes(d.stage),
  );
  return {
    booked: booked.length,
    showed: showed.length,
    rate: booked.length ? showed.length / booked.length : null,
  };
}
