import { describe, expect, it } from "vitest";
import { METRICS, formatMetric, metricValues, sumRows, toneOf } from "./adTargets";

const def = (k: string) => METRICS.find((m) => m.key === k)!;
const row = { spend: 319, impressions: 6935, reach: 4900, clicks: 80, lpv: 66, leads: 9, frequency: 1.4 };

describe("ads table numbers", () => {
  it("works out Facebook's metrics", () => {
    const v = metricValues(row);
    expect(Math.round(v.cpl!)).toBe(35);
    expect(Math.round(v.cpm!)).toBe(46);
    expect(v.ctr!.toFixed(2)).toBe("1.15");
    expect(v.reach).toBe(4900);
  });

  it("uses Facebook's names, no made-up columns", () => {
    expect(METRICS.map((m) => m.label)).toEqual([
      "Results", "Reach", "Frequency", "Cost per result", "Amount spent", "Impressions",
      "CPM (cost per 1,000 impressions)", "Link clicks", "CPC (cost per link click)", "CTR (link click-through rate)", "Landing page views",
    ]);
  });

  it("colours on target, within 20% and off target", () => {
    const v = metricValues(row);
    expect(toneOf(def("cpl"), v.cpl, row)).toBe("good");
    expect(toneOf(def("ctr"), v.ctr, row)).toBe("bad"); // 1.15 is under 1.2 (80% of 1.5)
    expect(toneOf(def("ctr"), 1.3, row)).toBe("near");
    expect(toneOf(def("cpl"), 70, row)).toBe("near");
  });

  it("no colour under R150 spend or fewer than 3 leads, and none for counts", () => {
    expect(toneOf(def("cpl"), 20, { spend: 120, leads: 6 })).toBe("none");
    expect(toneOf(def("cpl"), 20, { spend: 400, leads: 2 })).toBe("none");
    expect(toneOf(def("spend"), 400, row)).toBe("none");
  });

  it("totals don't add up reach or frequency (people repeat across rows)", () => {
    const t = sumRows([row, row]);
    expect(t.spend).toBe(638);
    expect(metricValues(t).reach).toBeNull();
    expect(metricValues(t).freq).toBeNull();
  });

  it("formats like Ads Manager", () => {
    expect(formatMetric("spend", 1634.64)).toBe("R1,634.64");
    expect(formatMetric("reach", 9318)).toBe("9,318");
    expect(formatMetric("ctr", 1.234)).toBe("1.23%");
    expect(formatMetric("lpv", null)).toBe("—");
  });
});
