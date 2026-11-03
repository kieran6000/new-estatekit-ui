import { describe, expect, it } from "vitest";
import { buildContract, type ContractTerms } from "./contractTemplate";

const terms: ContractTerms = {
  clientName: " Siva Naidoo ",
  company: "Harcourts",
  area: "Moreletapark",
  startDate: "2026-12-01",
  monthlyFee: 4500,
  adBudgetPerDay: 50,
  minimumMonths: 3,
  noticeDays: 30,
  extraTerms: "",
};

describe("the starter agreement", () => {
  const text = (doc: ReturnType<typeof buildContract>) => JSON.stringify(doc).replace(/ /g, " ");

  it("carries the client's terms into both the summary and the clauses", () => {
    const doc = buildContract(terms);
    expect(doc.client).toBe("Siva Naidoo");
    expect(doc.summary.map((s) => s.label)).toEqual(["Start date", "Monthly fee", "Ad budget", "Minimum term", "Notice to cancel", "Area"]);
    const all = text(doc);
    expect(all).toContain("R4 500 a month");
    expect(all).toContain("R50 a day");
    expect(all).toContain("3 months");
    expect(all).toContain("30 days");
    expect(all).toContain("Siva Naidoo of Harcourts");
    expect(all).toContain("in Moreletapark");
  });

  it("leaves out what wasn't agreed", () => {
    const doc = buildContract({ ...terms, company: "", area: "", adBudgetPerDay: null, minimumMonths: 1, noticeDays: 1 });
    const all = text(doc);
    expect(doc.company).toBeNull();
    expect(doc.summary.map((s) => s.label)).not.toContain("Ad budget");
    expect(doc.summary.map((s) => s.label)).not.toContain("Area");
    expect(all).toContain("1 month");
    expect(all).toContain("1 day");
    expect(all).not.toContain(" in .");
  });

  it("adds extra terms as their own numbered section, one clause a line", () => {
    const doc = buildContract({ ...terms, extraTerms: "First month half price.\n\nFree setup." });
    expect(doc.sections.at(-1)).toEqual({ heading: "Extra terms agreed", clauses: ["First month half price.", "Free setup."] });
    expect(buildContract(terms).sections.at(-1)?.heading).toBe("General");
  });

  it("tells them what's recorded, in the wording they sign", () => {
    expect(text(buildContract(terms))).toMatch(/record of when this agreement was opened and read/);
  });
});
