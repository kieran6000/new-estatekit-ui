// What needs a look on the Accounts page. One rule set, used for the strip at
// the top and the dot on every row.

export type IssueKind = "meta" | "payment" | "noLeads" | "inactive";
export type Health = "red" | "amber" | "green";

export interface HealthInput {
  /** Runs ads (has an ad account saved). */
  hasAds: boolean;
  /** Has an ad account but Meta won't let us read it. */
  metaUnreadable: boolean;
  paymentProblem: boolean;
  lastLeadMs: number | null;
  lastActiveMs: number | null;
  now: number;
}

const DAY = 864e5;

/** Quiet = no lead for this long while ads run. */
export const NO_LEADS_DAYS = 3;
/** Away = no sign of life in the app for this long. */
export const INACTIVE_DAYS = 7;

export function accountIssues(i: HealthInput): IssueKind[] {
  const out: IssueKind[] = [];
  if (i.metaUnreadable) out.push("meta");
  if (i.paymentProblem) out.push("payment");
  if (i.hasAds && !i.metaUnreadable && (i.lastLeadMs === null || i.now - i.lastLeadMs > NO_LEADS_DAYS * DAY)) out.push("noLeads");
  if (i.lastActiveMs === null || i.now - i.lastActiveMs > INACTIVE_DAYS * DAY) out.push("inactive");
  return out;
}

/** Red: ads or leads are in trouble. Amber: only that they've gone quiet in the app. */
export function healthOf(issues: IssueKind[]): Health {
  if (issues.some((k) => k !== "inactive")) return "red";
  return issues.length ? "amber" : "green";
}

export const ISSUE_TEXT: Record<IssueKind, { title: string; short: string }> = {
  meta: { title: "Meta can't read their ad account", short: "Meta can't read the ad account" },
  payment: { title: "Payment problem on their ad account", short: "Payment problem" },
  noLeads: { title: `No lead in ${NO_LEADS_DAYS}+ days while ads run`, short: `No lead in ${NO_LEADS_DAYS}+ days` },
  inactive: { title: `Hasn't opened the app in ${INACTIVE_DAYS}+ days`, short: "Not active this week" },
};

/** The WhatsApp to send a client whose ad account Meta can't read. */
export const META_ACCESS_MESSAGE = `Hi 👋 Your ad numbers aren't showing on your EstateKit dashboard yet because Facebook hasn't given us permission to see your ad account. It takes 2 minutes:

1. Go to business.facebook.com/settings
2. Tap *Accounts → Ad accounts* and choose your ad account
3. Tap *Assign partner* and enter EstateKit's business ID
4. Switch on *View performance* (and *Manage campaigns* if you'd like us to pause ads for you) and save

Message me when it's done and I'll check it's working.`;
