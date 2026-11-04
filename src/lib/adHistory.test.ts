import { describe, expect, it } from "vitest";
import { changedImages, changeKind, plainChange, scaleTop, timelineSteps, worthShowing } from "./adHistory";

const item = (what: string, from: string, to: string) => ({ what, type: "", change: { from, to } });

describe("ad history wording", () => {
  it("writes money in rands", () => {
    expect(plainChange(item("Account billed", "", "14100"))).toEqual({ from: "", to: "R 141.00" });
    expect(plainChange(item("Ad set budget updated", "7000", "150000"))?.to).toBe("R 1 500.00");
  });

  it("never shows a value it can't read", () => {
    expect(plainChange(item("Ad set budget updated", "[object Object]", "[object Object]"))).toBeNull();
    expect(plainChange({ what: "Ad created", type: "", change: null })).toBeNull();
  });

  it("treats picture addresses as pictures, not words", () => {
    const it = item("Ad updated", "https://a.example/1.png", "https://a.example/2.png");
    expect(plainChange(it)).toBeNull();
    expect(changedImages(it)).toEqual({ from: "https://a.example/1.png", to: "https://a.example/2.png" });
    expect(changedImages(item("Ad status updated", "Inactive", "Active"))).toBeNull();
  });

  it("says on and off", () => {
    expect(plainChange(item("Ad status updated", "Inactive", "Active"))).toEqual({ from: "Off", to: "On" });
  });

  it("leaves out the steps of an ad going through review", () => {
    expect(worthShowing(item("Ad status updated", "Inactive", "Pending Process"))).toBe(false);
    expect(worthShowing(item("Updated status of ad after it finishes Ad Review", "Inactive", "Active"))).toBe(false);
    expect(worthShowing(item("Ad delivered", "", "Started delivery"))).toBe(false);
    expect(worthShowing(item("Ad status updated", "Pending Process", "Active"))).toBe(true);
  });
});

describe("sorting changes", () => {
  it("knows the kinds", () => {
    expect(changeKind({ what: "Ad set budget updated", type: "update_ad_set_budget" })).toBe("budget");
    expect(changeKind({ what: "Spending limit updated", type: "ad_account_update_spend_limit" })).toBe("budget");
    expect(changeKind({ what: "Account billed", type: "ad_account_billing_charge" })).toBe("billing");
    expect(changeKind({ what: "Ad set targeting updated", type: "update_ad_set_target_spec" })).toBe("targeting");
    expect(changeKind({ what: "Ad set bid strategy updated", type: "update_ad_set_bid_strategy" })).toBe("bidding");
    expect(changeKind({ what: "Ad set performance goal updated", type: "update_ad_set_optimization_goal" })).toBe("bidding");
    expect(changeKind({ what: "Ad status updated", type: "update_ad_run_status" })).toBe("onoff");
    expect(changeKind({ what: "Ad updated", type: "update_ad_creative" })).toBe("creative");
    expect(changeKind({ what: "Ad created", type: "create_ad" })).toBe("creative");
    expect(changeKind({ what: "Campaign created", type: "create_campaign_group" })).toBe("creative");
    expect(changeKind({ what: "Ad name updated", type: "update_ad_friendly_name" })).toBe("other");
  });

  it("hides Facebook switching ads on after review, but not a person doing it", () => {
    const on = { what: "Ad status updated", type: "update_ad_run_status", change: { from: "Off", to: "On" } };
    expect(worthShowing({ ...on, who: "Meta" })).toBe(false);
    expect(worthShowing({ ...on, who: "Aldredt Malinga" })).toBe(true);
  });
});

describe("the timeline", () => {
  it("uses days for a month and weeks for longer", () => {
    const month = timelineSteps("2026-10-06", "2026-11-04");
    expect(month.unit).toBe("day");
    expect(month.steps).toHaveLength(30);
    const half = timelineSteps("2026-01-01", "2026-06-30");
    expect(half.unit).toBe("week");
    expect(half.steps[0]).toEqual({ start: "2026-01-01", end: "2026-01-07" });
    expect(half.steps[half.steps.length - 1].end).toBe("2026-06-30");
  });

  it("rounds the top of the scale up", () => {
    expect(scaleTop(25)).toBe(30);
    expect(scaleTop(7)).toBe(8);
    expect(scaleTop(0)).toBe(4);
    expect(scaleTop(130)).toBe(150);
  });
});
