import template from "./contractTemplate.md?raw";

// The agreement's wording lives in contractTemplate.md, exactly as written, and
// is filled in once, when a contract is created. That copy is what the client
// signs: changing the template never touches a contract that already exists.

export interface ContractSection {
  heading: string;
  /** One paragraph each. "• " starts a bullet, **word** is bold. */
  clauses: string[];
  /** Written as paragraphs. Contracts from before the real template have numbered clauses. */
  plain?: boolean;
  table?: { head: string[]; rows: string[][] };
}

export interface ContractDocument {
  title: string;
  provider: string;
  /** Who the provider is, under the letterhead. */
  providerLine?: string;
  client: string;
  company: string | null;
  /** Who signed for EstateKit, in their own hand. Part of the wording, so it's locked too. */
  issuer?: { name: string; signature: string | null };
  /** The client also initials the "At a glance" page. */
  initials?: boolean;
  summary: { label: string; value: string }[];
  sections: ContractSection[];
}

export interface ContractTerms {
  clientName: string;
  agency: string;
  clientId: string;
  email: string;
  targetAreas: string;
  /** Who works the leads, if not the client. Blank = the client. */
  nominatedAgent?: string;
  plan: string;
  paymentSchedule?: string;
  minAdSpend: number;
  adSpendPaidTo?: string;
  /** May we use their name and results in our marketing? */
  marketingUse?: boolean;
}

export const CONTRACT_TITLE = "EstateKit Service Agreement";
export const PLANS = ["3-month package: R7,500", "Monthly: R3,000 per 30 days"] as const;
export const DEFAULT_PLAN = PLANS[0];
export const isMonthly = (plan: string) => /^monthly/i.test(plan.trim());
export const PAYMENT_SCHEDULES = ["In full before launch", "2 equal payments: before launch and 30 days after launch"] as const;
/** A monthly plan is paid before each cycle, so it has no schedule to pick. */
export const MONTHLY_SCHEDULE = "Before each 30-day cycle";
export const AD_SPEND_PAID_TO = ["Meta directly", "EstateKit, passed to Meta at cost"] as const;
export const MIN_AD_SPEND = 70;
export const PROVIDER_NAME = "Kieran Ouseb";
/** Filled in when it's signed, so it's left in the wording as it is. */
export const SIGNATURE_DATE = "{{signature_date}}";

const PROVIDER_LINE = "Kieran Ouseb, trading as EstateKit, Boksburg, South Africa · partner@estatekit.co · Not VAT-registered";

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim().replace(/`/g, ""));

export function buildContract(t: ContractTerms): ContractDocument {
  const values: Record<string, string> = {
    client_name: t.clientName.trim(),
    agency_name: t.agency.trim(),
    client_id: t.clientId.trim(),
    client_email: t.email.trim(),
    target_areas: t.targetAreas.trim(),
    plan: t.plan.trim(),
    min_ad_spend: String(t.minAdSpend),
    nominated_agent: t.nominatedAgent?.trim() || "None: the client works the leads",
    payment_schedule: isMonthly(t.plan) ? MONTHLY_SCHEDULE : (t.paymentSchedule?.trim() || PAYMENT_SCHEDULES[0]),
    ad_spend_paid_to: t.adSpendPaidTo?.trim() || AD_SPEND_PAID_TO[0],
    marketing_use: t.marketingUse === false ? "No" : "Yes",
  };
  const filled = template.replace(/\{\{(\w+)\}\}/g, (tag, name: string) => values[name] ?? tag);

  const sections: ContractSection[] = [];
  for (const raw of filled.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("# ")) continue;
    if (line.startsWith("### ")) {
      sections.push({ heading: line.slice(4), clauses: [], plain: true });
      continue;
    }
    const section = sections[sections.length - 1];
    if (line.startsWith("|")) {
      if (/^\|[-|\s]+\|$/.test(line)) continue;
      if (section.table) section.table.rows.push(cells(line));
      else section.table = { head: cells(line), rows: [] };
    } else {
      section.clauses.push(line.startsWith("- ") ? `• ${line.slice(2)}` : line);
    }
  }

  return {
    title: CONTRACT_TITLE,
    provider: "EstateKit",
    providerLine: PROVIDER_LINE,
    client: values.client_name,
    company: values.agency_name || null,
    initials: true,
    summary: [],
    sections,
  };
}
