import type { QueryClient } from "@tanstack/react-query";
import { getFbAdAccount } from "../api/agentProfile";
import { getClient, getSpendDaily } from "../api/clients";
import { ymd } from "./range";

/** Loads a client's page in the background (their details, then their ad
 *  account and last 30 days of spend), so opening it is instant. Uses the same
 *  keys as the page, so it just fills the cache. Never throws. */
export async function prefetchClient(qc: QueryClient, agentId: string): Promise<void> {
  try {
    await qc.prefetchQuery({ queryKey: ["client", agentId], queryFn: () => getClient(agentId), staleTime: 60_000 });
    const acct = qc.getQueryData<Awaited<ReturnType<typeof getClient>>>(["client", agentId])?.profile.fb_ad_account_id;
    if (!acct) return;
    const since30 = ymd(new Date(Date.now() - 29 * 864e5));
    await Promise.all([
      qc.prefetchQuery({ queryKey: ["fbAdAccount", acct], queryFn: () => getFbAdAccount(acct), staleTime: 10 * 60_000 }),
      qc.prefetchQuery({ queryKey: ["spendDaily", acct, since30], queryFn: () => getSpendDaily(acct, since30), staleTime: 30 * 60_000 }),
    ]);
  } catch {
    /* it's only a head start */
  }
}
