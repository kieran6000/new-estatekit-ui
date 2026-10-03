// The marketing plan link shown on the thank-you page.
//
// The lead page makes the plan's random code before it sends the lead, so the
// thank-you page can link to the plan straight away (the lead is still being
// saved in the background). The server only keeps it for seller leads.
//
// The code never goes in the thank-you page's address: that page loads the
// agent's Facebook pixel, which reports the page address to Facebook, and the
// code opens a page with the seller's name and address. It travels in the
// router state, with a per-tab copy so a refresh still shows the link.

const key = (slug: string) => `ek_plan_${slug}`;

/** 32 hex characters, the same format the plan page and database expect. */
export function newPlanToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const isPlanToken = (t: unknown): t is string => typeof t === "string" && /^[a-f0-9]{32}$/.test(t);

/** null clears it, so a later non-seller lead never shows an earlier plan. */
export function rememberPlanToken(slug: string, token: string | null): void {
  try {
    if (token) sessionStorage.setItem(key(slug), token);
    else sessionStorage.removeItem(key(slug));
  } catch { /* private mode: the router state still has it */ }
}

export function recallPlanToken(slug: string): string | null {
  try {
    const t = sessionStorage.getItem(key(slug));
    return isPlanToken(t) ? t : null;
  } catch {
    return null;
  }
}
