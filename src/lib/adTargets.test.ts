import { describe, expect, it } from "vitest";
import { METRICS, metricValues, toneOf } from "./adTargets";

const def = (k: string) => METRICS.find((m) => m.key === k)!;
const row = { spend: 319, impressions: 6935, clicks: 80, lpv: 66, leads: 9, frequency: 1.4 };

describe("ad set targets", () => {
  it("works out the metrics like the design", () => {
    const v = metricValues(row);
    expect(Math.round(v.cpl!)).toBe(35);
    expect(Math.round(v.cpm!)).toBe(46);
    expect(v.ctr!.toFixed(2)).toBe("1.15");
    expect(Math.round(v.load!)).toBe(83);
  });

  it("colours on target, within 20% and off target", () => {
    const v = metricValues(row);
    expect(toneOf(def("cpl"), v.cpl, row)).toBe("good");
    expect(toneOf(def("ctr"), v.ctr, row)).toBe("bad"); // 1.15 is under 1.2 (80% of 1.5)
    expect(toneOf(def("ctr"), 1.3, row)).toBe("near");
    expect(toneOf(def("cpl"), 70, row)).toBe("near"); // within 20% over R60
  });

  it("no colour under R150 spend or fewer than 3 leads, and none for spend/leads", () => {
    expect(toneOf(def("cpl"), 20, { spend: 120, leads: 6 })).toBe("none");
    expect(toneOf(def("cpl"), 20, { spend: 400, leads: 2 })).toBe("none");
    expect(toneOf(def("spend"), 400, row)).toBe("none");
  });

  it("an instant form (no landing page) has no LP load or LP CVR", () => {
    const v = metricValues({ ...row, lpv: 0 });
    expect(v.load).toBeNull();
    expect(v.cvr).toBeNull();
  });
});
