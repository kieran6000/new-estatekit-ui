import { describe, expect, it } from "vitest";
import { leadFunnel } from "./leadFunnel";

describe("lead funnel", () => {
  it("counts each lead in every step it has passed", () => {
    const { steps, rest } = leadFunnel({ "New Lead": 9, "No Answer": 7, Lost: 4, Contacted: 4, Booked: 3, "Invalid Number": 1 });
    expect(steps.map((s) => s.count)).toEqual([28, 7, 3, 0]);
    expect(rest.map((s) => s.label)).toEqual(["New Lead", "No Answer", "Lost", "Invalid Number"]);
  });

  it("counts a mandate as booked and spoken to", () => {
    expect(leadFunnel({ "Mandate Signed": 2, "Offer Made": 1 }).steps.map((s) => s.count)).toEqual([3, 3, 3, 2]);
  });

  it("copes with no leads", () => {
    const { steps, rest } = leadFunnel({});
    expect(steps.every((s) => s.count === 0)).toBe(true);
    expect(rest).toEqual([]);
  });
});
