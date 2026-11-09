// What's wrong with an ad account, worst first, in the words Facebook's own
// billing page uses. Only what stops or is about to stop their ads.

export interface AccountFacts {
  accountStatus?: number | null;
  disableReason?: number | null;
  balance?: number | null;
  amountSpent?: number | null;
  spendCap?: number | null;
}

export type LimitState = "none" | "ok" | "near" | "reached";

/** Facebook's "Account spending limit": with a limit set, amount spent counts
 *  towards it, and their ads stop when it's reached. */
export function spendingLimit(a: AccountFacts | null | undefined): { state: LimitState; cap: number; spent: number; left: number; share: number } {
  const cap = Number(a?.spendCap) || 0;
  const spent = Math.max(0, Number(a?.amountSpent) || 0);
  if (!cap) return { state: "none", cap: 0, spent, left: 0, share: 0 };
  const share = Math.min(1, spent / cap);
  const left = Math.max(0, cap - spent);
  return { state: spent >= cap ? "reached" : share >= 0.9 ? "near" : "ok", cap, spent, left, share };
}

export interface AccountIssue {
  tone: "red" | "amber";
  title: string;
  detail: string;
}

const rands = (n: number) => "R " + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** The one thing to show at the top of the card, or null if all is well. */
export function accountIssue(a: AccountFacts | null | undefined, paymentProblem: string | null): AccountIssue | null {
  if (!a) return null;
  const status = a.accountStatus;
  if (status === 2) {
    return { tone: "red", title: "Ad account disabled", detail: a.disableReason === 3 ? "Facebook switched it off because of a payment problem. No ads are running." : "Facebook switched it off. No ads are running." };
  }
  if (status === 101 || status === 100) return { tone: "red", title: "Ad account closed", detail: "No ads can run on it." };
  const limit = spendingLimit(a);
  if (limit.state === "reached") {
    return { tone: "red", title: "Account spending limit reached", detail: `They've spent their ${rands(limit.cap)} limit, so their ads have stopped. Raise or remove the limit in Facebook billing to start them again.` };
  }
  if (status === 3) return { tone: "red", title: "Payment failed", detail: "Facebook couldn't charge them, so their ads may stop. Update the card or pay in Facebook billing." };
  if (status === 9) return { tone: "red", title: "Payment failed: grace period", detail: "Facebook is giving them a little time to pay before ads stop. Update the card or pay in Facebook billing." };
  if (paymentProblem) return { tone: "amber", title: "Check their payment", detail: paymentProblem };
  if (limit.state === "near") {
    return { tone: "amber", title: "Almost at the spending limit", detail: `${rands(limit.left)} left of their ${rands(limit.cap)} limit. Their ads stop when it runs out.` };
  }
  if (status === 8) return { tone: "amber", title: "Payment going through", detail: "A payment to Facebook is still being processed." };
  if (status === 7) return { tone: "amber", title: "Under review", detail: "Facebook is reviewing this ad account." };
  return null;
}

/** Facebook's Billing & payments page for this ad account. */
export const billingUrl = (adAccountId: string) =>
  `https://business.facebook.com/billing_hub/accounts/details?asset_id=${adAccountId.replace(/^act_/, "")}`;
