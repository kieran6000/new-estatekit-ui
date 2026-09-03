import { supabase, getCurrentUserId } from "./_client";
import type { Tier } from "../types";

export async function getTier(): Promise<Tier> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("agent_profiles")
    .select("tier")
    .eq("agent_id", userId)
    .single();
  if (error) throw new Error(error.message);
  return (data?.tier as Tier) ?? "paid";
}

export async function setTier(tier: Tier): Promise<void> {
  if (import.meta.env.PROD) throw new Error("tier.set is not available in production");
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("agent_profiles")
    .update({ tier })
    .eq("agent_id", userId);
  if (error) throw new Error(error.message);
}
