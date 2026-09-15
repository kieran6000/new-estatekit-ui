import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as tierApi from "../api/tier";
import { useIsOperator } from "./useAutomations";
import { useAuth } from "./useAuth";
import type { Tier } from "../types";

interface TierContextValue {
  tier: Tier;
  loading: boolean;
  setTier: (tier: Tier) => void;
}

const TierContext = createContext<TierContextValue | null>(null);

export function TierProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tier, setTierState] = useState<Tier>("free");
  const [loading, setLoading] = useState(true);

  // Re-read whenever the session changes hands. Fetching once on mount left the
  // previous user's tier in place after someone else signed in on the same tab.
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    tierApi
      .getTier()
      .then((t) => { if (!cancelled) setTierState(t); })
      // A missing profile row (or an offline moment) must not wedge `loading`
      // at true forever — settle and let callers fall back to their defaults.
      .catch((err) => { console.error("Couldn't read the account tier", err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // Keyed on the id alone — a new `user` object for the same person shouldn't
    // trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function setTier(next: Tier) {
    setTierState(next);
    tierApi.setTier(next);
  }

  return <TierContext.Provider value={{ tier, loading, setTier }}>{children}</TierContext.Provider>;
}

export function useTier() {
  const ctx = useContext(TierContext);
  if (!ctx) throw new Error("useTier must be used inside TierProvider");
  return ctx;
}

/**
 * Whether the signed-in user may see full lead phone numbers.
 *
 * Masking is an upsell nudge aimed at the free tier — it is NOT a security
 * control, since the real number is already in each row's `tel:` link and in
 * the API response. So while the tier is still loading we show the number
 * rather than flashing "•••• 1234" at a paying agent on every page load.
 *
 * This was previously gated on `isOperator`, which meant *every* agent — paid
 * ones included — saw masked numbers, and only staff ever saw the real thing.
 * An agent couldn't read their own lead's number to dial or WhatsApp it.
 */
export function useCanSeeFullPhone(): boolean {
  const { tier, loading } = useTier();
  const { data: isOperator } = useIsOperator();
  return isOperator === true || loading || tier !== "free";
}
