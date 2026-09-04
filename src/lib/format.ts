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
