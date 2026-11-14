import { toE164 } from "./phone";

// The leads search box: a name (any part of it), an email, or a phone number
// however it's typed. Numbers are stored as +27…, so "082 123" used to find
// nothing: the stored number has no 0 at the front.

/** The number's digits in each way someone might type it: "27821234567",
 *  "0821234567". (South Africa and Namibia write their numbers with a 0.) */
function phoneForms(phone: string): string[] {
  const e164 = toE164(phone).slice(1);
  const forms = [e164, phone.replace(/\D/g, "")];
  if (e164.startsWith("27")) forms.push("0" + e164.slice(2));
  if (e164.startsWith("264")) forms.push("0" + e164.slice(3));
  return forms.filter(Boolean);
}

export function leadMatchesSearch(lead: { name: string; phone: string; email?: string | null }, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  if (lead.name.toLowerCase().includes(q)) return true;
  if (lead.email && lead.email.toLowerCase().includes(q)) return true;
  // A number: only digits, spaces, +, -, ( and ). At least 3 digits, or every
  // lead would match a single "0".
  if (!/^[\d\s+()-]+$/.test(q)) return false;
  const digits = q.replace(/\D/g, "");
  if (digits.length < 3) return false;
  return phoneForms(lead.phone).some((f) => f.includes(digits));
}
