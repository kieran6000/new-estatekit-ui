import { cleanLeadPhone } from "../public-submit-lead/phone.ts";

// The rules behind signing a contract, kept apart so they can be tested.

const MAX_SIGNATURE_CHARS = 500_000;
export const CODE_MINUTES = 10;
export const MAX_CODE_TRIES = 5;
const MAX_CODES_AN_HOUR = 5;
const CODE_GAP_MS = 30_000;
/** Longer than the page's gap between reports, shorter than leaving it open. */
const MAX_SECONDS_A_REPORT = 60;

/** The same JSON whatever order the keys come back in: the database reorders them. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const documentHash = (document: unknown) => sha256(canonical(document));
export const codeHash = (contractId: string, code: string) => sha256(`${contractId}:${code}`);

/** International digits, so 083… and +2783… are the same number. "" if it can't be one. */
export function phoneDigits(raw: string): string {
  const d = cleanLeadPhone(raw).replace(/\D/g, "");
  const full = d.length === 10 && d.startsWith("0") ? "27" + d.slice(1) : d;
  return full.length >= 11 && full.length <= 15 ? full : "";
}

export const maskPhone = (digits: string) => `•••• ${digits.slice(-4)}`;

export const validSignature = (png: unknown): png is string =>
  typeof png === "string" && png.length <= MAX_SIGNATURE_CHARS && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png);

/** A full name is at least two words of letters, however they're typed. */
export const validSignerName = (name: unknown): name is string =>
  typeof name === "string" && name.length <= 120 && name.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w)).length >= 2;

/** Why another code can't go out yet, or null if it can. Protects the WhatsApp number every agent's alerts use. */
export function codeRefusal(sentAt: string[], now: number): string | null {
  const times = sentAt.map((t) => new Date(t).getTime());
  if (times.some((t) => now - t < CODE_GAP_MS)) return "We've just sent you a code. Check WhatsApp, or try again in 30 seconds.";
  if (times.filter((t) => now - t < 3_600_000).length >= MAX_CODES_AN_HOUR) return "Too many codes have been sent. Try again in an hour.";
  return null;
}

export const newCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");

/** How much of a report of reading time to believe. */
export const cleanSeconds = (n: unknown) => Math.min(Math.max(0, Math.round(Number(n)) || 0), MAX_SECONDS_A_REPORT);
export const cleanScroll = (n: unknown) => Math.min(Math.max(0, Math.round(Number(n)) || 0), 100);

export const firstIp = (forwardedFor: string | null) => forwardedFor?.split(",")[0]?.trim().slice(0, 64) || null;
