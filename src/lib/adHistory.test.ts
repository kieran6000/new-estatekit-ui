import { describe, expect, it } from "vitest";
import { plainChange, worthShowing } from "./adHistory";

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

  it("says on and off", () => {
    expect(plainChange(item("Ad status updated", "Inactive", "Active"))).toEqual({ from: "Off", to: "On" });
  });

  it("leaves out the steps of an ad going through review", () => {
    expect(worthShowing(item("Ad status updated", "Inactive", "Pending Process"))).toBe(false);
    expect(worthShowing(item("Updated status of ad after it finishes Ad Review", "Inactive", "Active"))).toBe(false);
    expect(worthShowing(item("Ad status updated", "Pending Process", "Active"))).toBe(true);
  });
});
