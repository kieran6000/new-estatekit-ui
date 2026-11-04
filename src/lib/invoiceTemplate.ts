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
const INVOICE_TERMS = [
  "Billed monthly. Payment is due before each month of campaign management begins.",
  "Ad spend is not included in this invoice. It is paid directly to Meta (Facebook) or invoiced separately.",
];

export const DEFAULT_ITEM = "Monthly Plan";
export const DEFAULT_DESCRIPTION = "Campaign management & success fee";
export const DEFAULT_PERIOD = "1 month";
export const DEFAULT_AMOUNT = 3000;
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
}

export interface InvoiceDocument extends InvoiceTerms {
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
    terms: INVOICE_TERMS,
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
  const d = raw.replace(/\D/g, "");
  const full = d.length === 10 && d.startsWith("0") ? `27${d.slice(1)}` : d;
  return full.length >= 11 && full.length <= 15 ? full : "";
}

/** Where an invoice has got to, furthest first. */
export function invoiceStatus(
  i: { paid_at: string | null; voided_at: string | null; due_date: string; first_opened_at: string | null; shared_at: string | null },
  today = todaySA(),
): { label: string; tone: "green" | "blue" | "amber" | "grey" | "red" } {
  if (i.paid_at) return { label: "Paid", tone: "green" };
  if (i.voided_at) return { label: "Cancelled", tone: "grey" };
  if (i.due_date < today) return { label: "Overdue", tone: "red" };
  if (i.first_opened_at) return { label: "Opened, not paid", tone: "amber" };
  if (i.shared_at) return { label: "Sent, not opened", tone: "blue" };
  return { label: "Not sent yet", tone: "grey" };
}
