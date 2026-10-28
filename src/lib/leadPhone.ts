// The WhatsApp number on a lead page. Catches typos and made-up numbers the
// moment they press the button, without an extra step for anyone who typed a
// real one. South African cellphones must look like one (10 digits, 06/07/08);
// other countries ("+971 …", or Namibia's "264 …" without the +) only need a
// believable length, so a buyer abroad is never turned away.

export type PhoneProblem = "short" | "long" | "not_mobile" | "junk";

// Seven of the same digit, or a run like 1234567, in the subscriber part.
const JUNK = /(\d)\1{6}|0123456|1234567|2345678|3456789|9876543|8765432|7654321|6543210/;

/** null when the number looks real, otherwise what's wrong with it. */
export function leadPhoneProblem(input: string): PhoneProblem | null {
  const d = input.replace(/\D/g, "");
  let local: string | null = null;
  if (d.startsWith("27")) {
    // "+27 082 …": the 0 typed after the country code.
    const rest = d.slice(2);
    local = "0" + (rest.startsWith("0") && rest.length === 10 ? rest.slice(1) : rest);
  } else if (d.startsWith("0")) {
    local = d;
  } else if (d.length === 9 && /^[6-8]/.test(d) && !input.trim().startsWith("+")) {
    local = "0" + d; // "82 123 4567": the leading 0 left off
  }
  if (local === null) {
    // Another country's number.
    if (d.length < 11) return "short";
    if (d.length > 15) return "long";
    return JUNK.test(d.slice(-9)) ? "junk" : null;
  }
  if (local.length < 10) return "short";
  if (local.length > 10) return "long";
  if (!/^0[6-8]/.test(local)) return "not_mobile";
  return JUNK.test(local.slice(1)) ? "junk" : null;
}

/** Plain-English message for the form. */
export function leadPhoneMessage(problem: PhoneProblem): string {
  switch (problem) {
    case "short": return "That number is missing some digits. A cellphone number has 10, e.g. 082 123 4567.";
    case "long": return "That number has too many digits. A cellphone number has 10, e.g. 082 123 4567.";
    case "not_mobile": return "Please use your cellphone number, e.g. 082 123 4567.";
    case "junk": return "Please enter your real WhatsApp number so we can reach you.";
  }
}

/** Spaces a South African number as it's typed ("082 123 4567",
 *  "+27 82 123 4567"). Anything else is left exactly as typed. */
export function formatLeadPhone(input: string): string {
  const t = input.trimStart();
  const group = (d: string, sizes: number[]) => {
    const out: string[] = [];
    let i = 0;
    for (const n of sizes) {
      if (i >= d.length) break;
      out.push(d.slice(i, i + n));
      i += n;
    }
    if (i < d.length) out[out.length - 1] += d.slice(i); // extra digits stay visible
    return out.join(" ");
  };
  if (t.startsWith("+27")) {
    const d = t.slice(3).replace(/\D/g, "");
    return d ? "+27 " + group(d, d.startsWith("0") ? [3, 3, 4] : [2, 3, 4]) : t;
  }
  if (t.startsWith("0")) return group(t.replace(/\D/g, ""), [3, 3, 4]);
  return input;
}
