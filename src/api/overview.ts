import { supabase, getActiveAgentId } from "./_client";
import type { OverviewDailyRow } from "../types";

export async function listOverviewDaily(): Promise<OverviewDailyRow[]> {
  const agentId = await getActiveAgentId();
  const { data, error } = await supabase
    .from("overview_daily")
    .select("*")
    .eq("agent_id", agentId)
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);
  return data as OverviewDailyRow[];
}
