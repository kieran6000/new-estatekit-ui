import { callApi } from "./_client";
import type { OverviewDailyRow } from "../types";

export async function listOverviewDaily(): Promise<OverviewDailyRow[]> {
  return callApi<OverviewDailyRow[]>("overview.list");
}
