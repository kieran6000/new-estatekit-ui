// "Get set up": the six things sellers see, and how complete an agent is.
// Used by the Get set up page, the menu (shown until it's all done) and the
// Clients list (so operators know who to help on the onboarding call).
// Everything else (brief, suburbs, budget, Facebook) is asked on /start or on
// the onboarding call, not here.

export const SALES_TARGET = 3;

/** photo, sales, name, whatsapp, email, agency */
export const SETUP_TOTAL = 6;

export type SetupKey = "photo" | "sales" | "name" | "whatsapp" | "email" | "agency";

export interface SetupInput {
  displayName: string | null | undefined;
  company: string | null | undefined;
  whatsappNumber: string | null | undefined;
  email: string | null | undefined;
  avatarUrl: string | null | undefined;
  salesCount: number;
}

const digits = (s: string) => {
  const d = (s || "").replace(/\D/g, "");
  return d.length === 10 && d.startsWith("0") ? "27" + d.slice(1) : d;
};

/** WhatsApp needs a cellphone. South African numbers must be mobiles (06/07/08,
 *  not an 010/011 office line); other countries (e.g. Namibia +264) are
 *  accepted. Same rule as the confirmation email's WhatsApp link. */
export function isCellphone(s: string | null | undefined): boolean {
  const d = digits(s || "");
  return d.startsWith("27") ? /^27[6-8]\d{8}$/.test(d) : /^[1-9]\d{8,14}$/.test(d);
}

export const isEmail = (s: string | null | undefined) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());

/** A first and last name, the way sellers should see it. */
export const isFullName = (s: string | null | undefined) => (s || "").trim().split(/\s+/).filter(Boolean).length >= 2;

export function setupDone(p: SetupInput): Record<SetupKey, boolean> {
  return {
    photo: /^https:\/\//.test(p.avatarUrl || ""),
    sales: p.salesCount >= SALES_TARGET,
    name: isFullName(p.displayName),
    whatsapp: isCellphone(p.whatsappNumber),
    email: isEmail(p.email),
    agency: !!(p.company || "").trim(),
  };
}

export function setupProgress(p: SetupInput): { done: number; total: number; complete: boolean } {
  const flags = Object.values(setupDone(p));
  const done = flags.filter(Boolean).length;
  return { done, total: flags.length, complete: done === flags.length };
}
