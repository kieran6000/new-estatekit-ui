/**
 * Repairs the shapes a form can send that aren't a real number, whichever form
 * it came from: "+27 083 …" (the 0 kept after the country code), "+27+264 …"
 * (+27 put in front of someone abroad) and "83 …" (the 0 left off). Anything
 * else is kept as sent: a lead is never turned away here, a wrong number is
 * still a lead with a name and answers.
 */
export function cleanLeadPhone(raw: string): string {
  const t = raw.trim();
  const d = t.replace(/\D/g, "");
  if (/^\+27\s*\+/.test(t)) return "+" + d.slice(2);
  if (d.length === 12 && d.startsWith("270")) return "+27" + d.slice(3);
  if (d.length === 9 && /^[6-8]/.test(d) && !t.startsWith("+")) return "+27" + d;
  return t;
}
