import { describe, expect, it } from "vitest";
import { addDays, changeKind, chartBuckets, impactOf, isDecision } from "./changeImpact";

const fill = (from: string, days: number, value: number) => Object.fromEntries(Array.from({ length: days }, (_, i) => [addDays(from, i), value]));
const DAY = "2026-10-15";
const TODAY = "2026-11-04";

describe("what happened after a change", () => {
  it("calls it better when each lead costs less afterwards", () => {
    const leads = { "2026-10-10": 2, "2026-10-18": 5 };
    const spend = fill("2026-10-08", 15, 100);
    const r = impactOf(DAY, TODAY, leads, spend);
    expect(r.before.costPerLead).toBe(350);
    expect(r.after.costPerLead).toBe(140);
    expect(r.verdict).toBe("better");
  });

  it("calls it worse when each lead costs more, and the same for a small move", () => {
    const spend = fill("2026-10-08", 15, 100);
    expect(impactOf(DAY, TODAY, { "2026-10-10": 5, "2026-10-18": 2 }, spend).verdict).toBe("worse");
    expect(impactOf(DAY, TODAY, { "2026-10-10": 5, "2026-10-18": 5 }, spend).verdict).toBe("same");
  });

  it("doesn't judge too soon, on too few leads, or when ads weren't running", () => {
    const spend = fill("2026-10-08", 15, 100);
    expect(impactOf("2026-11-03", TODAY, { "2026-10-30": 9 }, fill("2026-10-27", 8, 50)).verdict).toBe("soon");
    expect(impactOf(DAY, TODAY, { "2026-10-10": 1 }, spend).verdict).toBe("few");
    expect(impactOf(DAY, TODAY, { "2026-10-18": 5 }, fill("2026-10-16", 7, 100)).verdict).toBe("not_running");
  });

  it("leaves today out, because it isn't over", () => {
    const r = impactOf("2026-11-01", TODAY, {}, {});
    expect(r.after.days).toBe(2);
  });
});

describe("sorting changes", () => {
  it("knows the kinds", () => {
    expect(changeKind({ what: "Ad set budget updated", type: "" })).toBe("budget");
    expect(changeKind({ what: "Account billed", type: "" })).toBe("billing");
    expect(changeKind({ what: "Ad status updated", type: "" })).toBe("onoff");
    expect(changeKind({ what: "Ad created", type: "" })).toBe("new");
  });

  it("only counts what a person decided", () => {
    expect(isDecision({ what: "Ad set budget updated", type: "", who: "Aldredt Malinga" })).toBe(true);
    expect(isDecision({ what: "Ad status updated", type: "", who: "Meta" })).toBe(false);
    expect(isDecision({ what: "Account billed", type: "", who: "Someone" })).toBe(false);
  });
});

describe("chart buckets", () => {
  it("uses days for a month and weeks for longer", () => {
    expect(chartBuckets("2026-10-06", "2026-11-04")).toHaveLength(30);
    const weeks = chartBuckets("2026-01-01", "2026-06-30");
    expect(weeks[0]).toEqual({ start: "2026-01-01", end: "2026-01-07" });
    expect(weeks[weeks.length - 1].end).toBe("2026-06-30");
  });
});
