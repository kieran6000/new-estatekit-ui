// Phone numbers, however people type them. One set of rules for the whole app:
// a copy lives at supabase/functions/_shared/phone.ts for the server, and a
// test fails if the two ever differ.
//
// South Africa is the default country. All of these are the same number:
//   082 668 5452 · 0826685452 · 82 668 5452 · 27826685452 · +27 82 668 5452
//   +27 082 668 5452 · +27 (0) 82 668 5452 · 0027 82 668 5452 · 082-668-5452
// Other countries need their code: +264 85 287 8236, or 264852878236.

/** The first number in text like "082 111 2222 / 083 333 4444". */
function firstNumber(raw: string): string {
  const parts = raw.split(/\s*(?:\/|,|;|\bor\b|\|)\s*/i).filter((p) => /\d/.test(p));
  return parts[0] ?? raw;
}

/** "+27826685452", or "" when it can't be a phone number. */
export function toE164(raw: string | null | undefined): string {
  let t = firstNumber(String(raw ?? "")).replace(/[​-‏‪-‮⁠﻿]/g, "").trim();
  // "+27 +264 …": +27 put in front of a number that already had its own code.
  const twice = t.match(/^\+?\s*27\s*\+(.*)$/);
  if (twice) t = "+" + twice[1];
  let plus = t.startsWith("+");
  let d = t.replace(/\D/g, "");
  if (!plus && d.startsWith("00")) { plus = true; d = d.slice(2); } // 0027 …
  if (!d) return "";
  if (plus) {
    if (d.startsWith("270") && d.length === 12) d = "27" + d.slice(3); // +27 0 82 …
    return d.length >= 8 && d.length <= 15 && !d.startsWith("0") ? "+" + d : "";
  }
  if (d.length === 10 && d.startsWith("0")) return "+27" + d.slice(1); // 082 …
  if (d.length === 9 && /^[1-9]/.test(d)) return "+27" + d; // 82 … (the 0 left off)
  if (d.length === 12 && d.startsWith("270")) return "+27" + d.slice(3); // 27 082 …
  if (d.length >= 11 && d.length <= 15 && !d.startsWith("0")) return "+" + d; // 2782 …, 264 …
  return "";
}

/** "27826685452": the number the way WhatsApp and wa.me links want it. "" if it can't be one. */
export const waDigits = (raw: string | null | undefined): string => toE164(raw).slice(1);

/** Can it get WhatsApp? A South African number must be a cellphone (06, 07,
 *  08), not an office line. Other countries only need to be a real length. */
export function isMobile(raw: string | null | undefined): boolean {
  const e = toE164(raw);
  if (!e) return false;
  return e.startsWith("+27") ? /^\+27[6-8]\d{8}$/.test(e) : /^\+[1-9]\d{7,14}$/.test(e);
}

/** "082 668 5452" for South Africa, "+264 852878236" otherwise. The text as typed if it isn't a number. */
export function prettyPhone(raw: string | null | undefined): string {
  const e = toE164(raw);
  if (!e) return String(raw ?? "").trim();
  if (/^\+27\d{9}$/.test(e)) return `0${e.slice(3, 5)} ${e.slice(5, 8)} ${e.slice(8)}`;
  const code = e.match(/^\+(1|2[0-9]{2}|3[0-9]{1,2}|4[0-9]{1,2}|[5-9][0-9]{1,2})/)?.[1] ?? "";
  return code ? `+${code} ${e.slice(1 + code.length)}` : e;
}

/** Two numbers are the same, however each was typed. */
export const samePhone = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const x = toE164(a);
  return !!x && x === toE164(b);
};
