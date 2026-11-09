import { describe, expect, it } from "vitest";
import { accountIssue, billingUrl, spendingLimit } from "./adAccountHealth";

describe("spending limit", () => {
  it("knows when there isn't one", () => {
    expect(spendingLimit({ amountSpent: 900 }).state).toBe("none");
  });
  it("shows how much is left, and when it's nearly or fully used", () => {
    expect(spendingLimit({ amountSpent: 500, spendCap: 2000 })).toMatchObject({ state: "ok", left: 1500, share: 0.25 });
    expect(spendingLimit({ amountSpent: 1850, spendCap: 2000 }).state).toBe("near");
    expect(spendingLimit({ amountSpent: 2000, spendCap: 2000 })).toMatchObject({ state: "reached", left: 0, share: 1 });
  });
});

describe("what's wrong with the account", () => {
  it("says nothing when all is well", () => {
    expect(accountIssue({ accountStatus: 1, amountSpent: 100, spendCap: 2000 }, null)).toBeNull();
  });
  it("puts a reached limit in plain red", () => {
    expect(accountIssue({ accountStatus: 1, amountSpent: 2000, spendCap: 2000 }, null)).toMatchObject({ tone: "red", title: "Account spending limit reached" });
  });
  it("warns before the limit runs out", () => {
    expect(accountIssue({ accountStatus: 1, amountSpent: 1900, spendCap: 2000 }, null)?.title).toBe("Almost at the spending limit");
  });
  it("puts a disabled account first", () => {
    expect(accountIssue({ accountStatus: 2, disableReason: 3, amountSpent: 2000, spendCap: 2000 }, null)?.title).toBe("Ad account disabled");
  });
  it("passes a payment worry through", () => {
    expect(accountIssue({ accountStatus: 1 }, "More is owing than usual.")).toMatchObject({ tone: "amber", detail: "More is owing than usual." });
  });
  it("links to their billing page", () => {
    expect(billingUrl("act_123")).toBe("https://business.facebook.com/billing_hub/accounts/details?asset_id=123");
  });
});
