import { describe, expect, it } from "vitest";
import { accountIssues, healthOf } from "./accountHealth";

const now = Date.parse("2026-11-01T10:00:00Z");
const ago = (days: number) => now - days * 864e5;
const base = { hasAds: true, metaUnreadable: false, paymentProblem: false, lastLeadMs: ago(1), lastActiveMs: ago(1), now };

describe("account health", () => {
  it("a client with recent leads and activity is fine", () => {
    expect(accountIssues(base)).toEqual([]);
    expect(healthOf([])).toBe("green");
  });

  it("Meta unreadable is red, and doesn't also say 'no leads' (we can't see their ads)", () => {
    const i = accountIssues({ ...base, metaUnreadable: true, lastLeadMs: ago(10) });
    expect(i).toEqual(["meta"]);
    expect(healthOf(i)).toBe("red");
  });

  it("no lead for 3+ days while ads run is red; with no ads it isn't flagged", () => {
    expect(accountIssues({ ...base, lastLeadMs: ago(4) })).toEqual(["noLeads"]);
    expect(accountIssues({ ...base, lastLeadMs: null })).toEqual(["noLeads"]);
    expect(accountIssues({ ...base, hasAds: false, lastLeadMs: ago(30) })).toEqual([]);
  });

  it("only going quiet in the app is amber", () => {
    const i = accountIssues({ ...base, lastActiveMs: ago(9) });
    expect(i).toEqual(["inactive"]);
    expect(healthOf(i)).toBe("amber");
    expect(accountIssues({ ...base, lastActiveMs: null })).toEqual(["inactive"]);
  });

  it("a payment problem is red", () => {
    expect(healthOf(accountIssues({ ...base, paymentProblem: true }))).toBe("red");
  });
});
