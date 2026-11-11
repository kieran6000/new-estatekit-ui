import { waDigits } from "./phone";
// What an invoice says. Each invoice keeps its own copy of this when it's
// created, so changing the banking details here only affects new ones.

export const INVOICE_BANK = {
  bank: "FNB (First National Bank)",
  holder: "Sibusiso Moyo",
  account: "63184740017",
  branch: "250655",
  country: "South Africa",
};
export const INVOICE_LOCATION = "Boksburg, South Africa";
export const INVOICE_EMAIL = "partner@estatekit.co";
// The two plans, as the service agreement has them.
export const INVOICE_PLANS = {
  monthly: { label: "Monthly plan: R3,000 per 30 days", item: "Monthly Plan", period: "30 days", amount: 3000, days: 30 },
  quarter: { label: "3-month package: R7,500", item: "3-Month Package", period: "90 days", amount: 7500, days: 90 },
} as const;
export type InvoicePlan = keyof typeof INVOICE_PLANS;
/** The 3-month package can be paid in 2 equal payments (as the agreement allows):
 *  the first before launch, the second 30 days after launch. Which one this invoice is. */
export type Instalment = 1 | 2;
export const QUARTER_HALF = INVOICE_PLANS.quarter.amount / 2;
/** "3-Month Package, payment 1 of 2" */
export const instalmentItem = (n: Instalment) => `${INVOICE_PLANS.quarter.item}, payment ${n} of 2`;
/** The least ad spend the agreement allows, a day. */
export const MIN_DAILY_AD_SPEND = 70;

export const DEFAULT_ITEM = INVOICE_PLANS.monthly.item;
export const DEFAULT_DESCRIPTION = "Campaign management & success fee";
export const DEFAULT_PERIOD = INVOICE_PLANS.monthly.period;
export const DEFAULT_AMOUNT = INVOICE_PLANS.monthly.amount;

/** What the invoice's terms say: how the plan is billed, and whether ad spend is on it. */
export function invoiceTerms(plan: InvoicePlan, adSpend: number, instalment?: Instalment): string[] {
  const quarter = instalment
    ? `3-month package of ${money(INVOICE_PLANS.quarter.amount)}, paid in 2 equal payments of ${money(QUARTER_HALF)}: the first before campaign management begins, the second 30 days after launch. This invoice is payment ${instalment} of 2.`
    : "3-month package, paid in advance. Payment is due before campaign management begins.";
  return [
    plan === "quarter" ? quarter : "Billed monthly. Payment is due before each 30-day cycle of campaign management begins.",
    adSpend > 0
      ? `Ad spend of ${money(adSpend)} is included in this invoice. EstateKit pays it to Meta (Facebook) at cost, with no markup, and refunds any unspent balance when the agreement ends.`
      : "Ad spend is not included in this invoice. It is paid directly to Meta (Facebook).",
  ];
}
const DEFAULT_DAYS_TO_PAY = 7;

export interface InvoiceTerms {
  name: string;
  agency: string;
  email: string;
  phone: string;
  item: string;
  description: string;
  period: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  /** Which plan it's for (sets the terms). Older invoices don't say. */
  plan?: InvoicePlan;
  /** Ad spend on this invoice, paid on to Meta at cost. 0 or missing = not on it. */
  adSpend?: number;
  /** The 3-month package in 2 payments: which one this is. Missing = paid in full. */
  instalment?: Instalment;
}

export interface InvoiceDocument extends InvoiceTerms {
  /** The fee plus any ad spend. Older invoices have only the fee, so it's the amount. */
  total?: number;
  terms: string[];
  bank: typeof INVOICE_BANK;
  location: string;
  contactEmail: string;
}

export function buildInvoice(t: InvoiceTerms): InvoiceDocument {
  return {
    name: t.name.trim(),
    agency: t.agency.trim(),
    email: t.email.trim(),
    phone: t.phone.trim(),
    item: t.item.trim(),
    description: t.description.trim(),
    period: t.period.trim(),
    amount: t.amount,
    issueDate: t.issueDate,
    dueDate: t.dueDate,
    plan: t.plan ?? "monthly",
    adSpend: t.adSpend && t.adSpend > 0 ? t.adSpend : 0,
    total: t.amount + (t.adSpend && t.adSpend > 0 ? t.adSpend : 0),
    ...(t.plan === "quarter" && t.instalment ? { instalment: t.instalment } : {}),
    terms: invoiceTerms(t.plan ?? "monthly", t.adSpend ?? 0, t.plan === "quarter" ? t.instalment : undefined),
    bank: INVOICE_BANK,
    location: INVOICE_LOCATION,
    contactEmail: INVOICE_EMAIL,
  };
}

/** R3 000.00 */
export const money = (n: number) => `R${Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;

/** Today in South Africa, as YYYY-MM-DD. */
export const todaySA = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });

export function defaultDueDate(today = todaySA()): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + DEFAULT_DAYS_TO_PAY);
  return d.toISOString().slice(0, 10);
}

/** 3 November 2026 */
export const longDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-ZA", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

/** The number wa.me needs: South African 0… numbers become 27…. Empty if it can't be one. */
export function whatsappDigits(raw: string): string {
  const full = waDigits(raw);
  return full.length >= 11 && full.length <= 15 ? full : "";
}

/** Where an invoice has got to, furthest first. */
export function invoiceStatus(
  i: { paid_at: string | null; voided_at: string | null; due_date: string; first_opened_at: string | null; shared_at: string | null },
  today = todaySA(),
): { label: string; tone: "green" | "blue" | "amber" | "grey" | "red" } {
  if (i.paid_at) return { label: "Paid", tone: "green" };
  if (i.voided_at) return { label: "Cancelled", tone: "grey" };
  if (i.due_date < today) return { label: "Past due date", tone: "amber" };
  if (i.first_opened_at) return { label: "Opened", tone: "blue" };
  if (i.shared_at) return { label: "Sent, not opened", tone: "blue" };
  return { label: "Not sent yet", tone: "grey" };
}
