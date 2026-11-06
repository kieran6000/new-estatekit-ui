// How far their leads have got, from the count of leads in each stage. A lead
// that's booked was also spoken to, so each step includes the steps after it.

const SPOKE_TO = ["Contacted"];
const BOOKED = ["Booked", "Viewing Booked", "Offer Made"];
const MANDATES = ["Mandate Signed", "Bought"];
const COUNTED = new Set([...SPOKE_TO, ...BOOKED, ...MANDATES]);

export interface FunnelStep { label: string; count: number }

export function leadFunnel(byStage: Record<string, number>): { steps: FunnelStep[]; rest: FunnelStep[] } {
  const sum = (stages: string[]) => stages.reduce((n, s) => n + (byStage[s] ?? 0), 0);
  const mandates = sum(MANDATES);
  const booked = mandates + sum(BOOKED);
  const spokeTo = booked + sum(SPOKE_TO);
  const total = Object.values(byStage).reduce((n, c) => n + c, 0);
  return {
    steps: [
      { label: "Leads", count: total },
      { label: "Spoken to", count: spokeTo },
      { label: "Booked", count: booked },
      { label: "Mandates", count: mandates },
    ],
    // Where the rest are right now, biggest first.
    rest: Object.entries(byStage)
      .filter(([stage, count]) => !COUNTED.has(stage) && count > 0)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  };
}
