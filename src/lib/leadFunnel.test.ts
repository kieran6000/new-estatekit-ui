import { describe, expect, it } from "vitest";
import { stageCounts } from "./leadFunnel";

describe("stage counts", () => {
  it("lists stages with leads, in pipeline order, by their real names", () => {
    const { total, stages } = stageCounts({ Lost: 4, "New Lead": 9, Booked: 3, "No Answer": 7, Contacted: 4, "Invalid Number": 1, "Mandate Signed": 0 });
    expect(total).toBe(28);
    expect(stages.map((s) => s.stage)).toEqual(["New Lead", "No Answer", "Contacted", "Booked", "Lost", "Invalid Number"]);
  });

  it("puts a stage it doesn't know at the end", () => {
    expect(stageCounts({ Mystery: 2, "New Lead": 1 }).stages.map((s) => s.stage)).toEqual(["New Lead", "Mystery"]);
  });

  it("copes with no leads", () => {
    expect(stageCounts({})).toEqual({ total: 0, stages: [] });
  });
});
