import { waDigits } from "./phone";
/** Turn raw FB answer keys like "1_-_3_months" / "just_curious" into
 *  readable text ("1 - 3 months", "Just curious"). Leaves normal text
 *  (addresses, sentences) untouched apart from stray underscores. */
export function prettyAnswer(value: string): string {
  if (!value) return value;
  const cleaned = value.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Mask all but the last 4 digits of a phone number, for agents who
 *  shouldn't see full lead numbers. Calling still works via the app. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return phone;
  const last4 = digits.slice(-4);
  return `•••• ${last4}`;
}

/** Fills the placeholders agents can use in their thank-you message:
 *  {name} = the lead's first name, {agent} = the agent's first name (or
 *  "Our team" when the page has none). */
export function fillMessage(text: string, lead: string, agentName: string | null | undefined): string {
  const agent = (agentName || "").trim().split(/\s+/)[0] || "Our team";
  return (text || "").replaceAll("{name}", lead || "there").replaceAll("{agent}", agent);
}

/** South African numbers with the country code: "082 668 5452", "+27 082 668 5452"
 *  and "82 668 5452" → "27826685452". */
export function intlDigits(phone: string): string {
  return waDigits(phone) || phone.replace(/\D/g, "");
}

/** A link that dials a lead. It needs the +: without it a phone treats 2782… as
 *  a local number, and the call fails as invalid. */
export const telHref = (phone: string) => `tel:+${intlDigits(phone)}`;
