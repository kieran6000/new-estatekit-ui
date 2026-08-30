import { getStore, setStore } from "./_store";
import type { Tier } from "../types";

const KEY = "tier";

// TODO: connect backend — replace with a real subscription/plan lookup.
export async function getTier(): Promise<Tier> {
  return getStore<Tier>(KEY, "free");
}

// Dev-only convenience so the demo can flip tiers instantly — a real backend
// would never expose a client-writable tier.
export async function setTier(tier: Tier): Promise<void> {
  setStore<Tier>(KEY, tier);
}
