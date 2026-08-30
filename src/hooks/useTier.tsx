import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as tierApi from "../api/tier";
import type { Tier } from "../types";

interface TierContextValue {
  tier: Tier;
  loading: boolean;
  setTier: (tier: Tier) => void;
}

const TierContext = createContext<TierContextValue | null>(null);

export function TierProvider({ children }: { children: ReactNode }) {
  const [tier, setTierState] = useState<Tier>("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tierApi.getTier().then((t) => {
      setTierState(t);
      setLoading(false);
    });
  }, []);

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
