import { describe, expect, it } from "vitest";
import { COLUMN_LABEL, DEFAULT_PREFS, PRESETS, visibleColumns } from "./adColumns";

describe("ads table columns", () => {
  it("has Ads Manager's presets, by Facebook's names", () => {
    expect(PRESETS.performance.cols.map((c) => COLUMN_LABEL[c])).toEqual(["Delivery", "Results", "Reach", "Frequency", "Cost per result", "Budget", "Amount spent", "Ends"]);
    expect(PRESETS.performance_clicks.cols.slice(8).map((c) => COLUMN_LABEL[c])).toEqual([
      "Impressions", "CPM (cost per 1,000 impressions)", "Link clicks", "CPC (cost per link click)", "CTR (link click-through rate)", "Landing page views",
    ]);
  });

  it("ads have no Budget or Ends; your own set is used when chosen", () => {
    expect(visibleColumns(DEFAULT_PREFS, "ad")).not.toContain("budget");
    expect(visibleColumns(DEFAULT_PREFS, "ad")).not.toContain("ends");
    expect(visibleColumns({ ...DEFAULT_PREFS, choice: "custom", custom: ["spend", "leads"] }, "campaign")).toEqual(["spend", "leads"]);
  });
});
