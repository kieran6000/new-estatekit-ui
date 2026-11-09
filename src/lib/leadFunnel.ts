// Where their leads are, by the pipeline's own stage names, in pipeline order.

export const STAGE_ORDER = ["New Lead", "No Answer", "Contacted", "Booked", "Viewing Booked", "Offer Made", "Mandate Signed", "Bought", "Lost", "Invalid Number"];

export interface StageCount { stage: string; count: number }

/** Each stage that has leads, in pipeline order; any stage we don't know goes last. */
export function stageCounts(byStage: Record<string, number>): { total: number; stages: StageCount[] } {
  const known = STAGE_ORDER.filter((s) => (byStage[s] ?? 0) > 0).map((stage) => ({ stage, count: byStage[stage] }));
  const other = Object.entries(byStage)
    .filter(([stage, count]) => !STAGE_ORDER.includes(stage) && count > 0)
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count);
  const stages = [...known, ...other];
  return { total: stages.reduce((n, s) => n + s.count, 0), stages };
}
