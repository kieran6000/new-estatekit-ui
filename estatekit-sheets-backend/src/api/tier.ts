import { callApi } from "./_client";
import type { Tier } from "../types";

export async function getTier(): Promise<Tier> {
  return callApi<Tier>("tier.get");
}

// Dev-only convenience — a real production build should remove the
// tier.set action from the backend switch, since a client should never be
// able to grant itself "paid".
export async function setTier(tier: Tier): Promise<void> {
  await callApi("tier.set", { tier });
}
