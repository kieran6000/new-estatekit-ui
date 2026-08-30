import { getStore } from "./_store";
import type { OverviewDailyRow } from "../types";

const KEY = "overview_daily";
const AGENT_ID = "mock-agent-1";

function seedOverview(): OverviewDailyRow[] {
  const rows: OverviewDailyRow[] = [];
  const today = new Date();
  for (let i = 0; i < 35; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const leads = Math.round(2 + Math.random() * 5);
    const spend = Math.round(leads * (120 + Math.random() * 60));
    const appts = Math.round(leads * (0.2 + Math.random() * 0.2));
    const mandates = Math.random() > 0.85 ? 1 : 0;
    rows.push({
      id: `ov-${i}`,
      agent_id: AGENT_ID,
      date: d.toISOString().slice(0, 10),
      spend,
      leads,
      appts,
      mandates,
      commission: mandates ? Math.round(30000 + Math.random() * 40000) : 0,
    });
  }
  return rows;
}

// TODO: connect backend — replace with a real `select * from overview_daily` call.
export async function listOverviewDaily(): Promise<OverviewDailyRow[]> {
  return getStore<OverviewDailyRow[]>(KEY, seedOverview());
}
