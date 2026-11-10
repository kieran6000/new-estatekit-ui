import { describe, expect, it } from "vitest";
import source from "./contractTemplate.md?raw";
import { buildContract, MONTHLY_SCHEDULE, SIGNATURE_DATE, type ContractTerms } from "./contractTemplate";

const terms: ContractTerms = {
  clientName: " Stephan Dau ",
  agency: "Langdon Real Estate",
  clientId: "",
  email: "contact@grandproperty24.com",
  targetAreas: "Gardens, Tamboerskloof",
  plan: "3-month package: R7,500",
  paymentSchedule: "2 equal payments: before launch and 30 days after launch",
  minAdSpend: 70,
  adSpendPaidTo: "Meta directly",
  marketingUse: false,
};

describe("the service agreement", () => {
  const doc = buildContract(terms);
  const details = doc.sections.find((s) => s.heading === "Client details")!.table!;
  const row = (label: string) => details.rows.find((r) => r[0] === label)!;

  it("fills in the client's details and EstateKit's fixed ones", () => {
    expect(doc.client).toBe("Stephan Dau");
    expect(row("Name")).toEqual(["Name", "Kieran Ouseb, trading as EstateKit", "Stephan Dau"]);
    expect(row("Agency")).toEqual(["Agency", "EstateKit", "Langdon Real Estate"]);
    expect(row("Email for notices")[1]).toBe("partner@estatekit.co");
    expect(row("Target suburbs")[2]).toBe("Gardens, Tamboerskloof");
    expect(row("Plan")[2]).toBe("3-month package: R7,500");
    expect(row("Payment schedule")[2]).toBe("2 equal payments: before launch and 30 days after launch");
    expect(row("Minimum daily ad spend")[2]).toBe("R70 per day (at least R70)");
    expect(row("Ad spend paid to")[2]).toBe("Meta directly");
    expect(row("Use of your name and results in our marketing")[2]).toBe("No");
  });

  it("says the client works the leads when there's no nominated agent", () => {
    expect(row("Nominated agent")[2]).toBe("None: the client works the leads");
    const other = buildContract({ ...terms, nominatedAgent: " Storm Hargreaves " }).sections.find((s) => s.heading === "Client details")!.table!;
    expect(other.rows.find((r) => r[0] === "Nominated agent")![2]).toBe("Storm Hargreaves");
  });

  it("pays a monthly plan before each cycle, whatever schedule was picked", () => {
    const monthly = buildContract({ ...terms, plan: "Monthly: R3,000 per 30 days" }).sections.find((s) => s.heading === "Client details")!.table!;
    expect(monthly.rows.find((r) => r[0] === "Payment schedule")![2]).toBe(MONTHLY_SCHEDULE);
  });

  it("leaves an unknown ID blank and the signature date for signing", () => {
    expect(row("ID or registration no.")[2]).toBe("");
    expect(row("Signature date")[2]).toBe(SIGNATURE_DATE);
    expect(JSON.stringify(doc).replace(SIGNATURE_DATE, "")).not.toContain("{{");
  });

  it("keeps every word of the template, in order", () => {
    const words = (s: string) => s.replace(/R`{{min_ad_spend}}`/g, " ").replace(/[|`*#]/g, " ").replace(/^\s*- /gm, " ").replace(/^\s*-+\s*$/gm, " ").replace(/\{\{\w+\}\}/g, " ").split(/\s+/).filter(Boolean);
    const out = doc.sections.flatMap((s) => [
      s.heading,
      ...(s.table ? [s.table.head.join(" "), ...s.table.rows.flat()] : []),
      ...s.clauses.map((c) => c.replace(/^• /, "")),
    ]).join(" ");
    const have = words(out);
    let at = 0;
    for (const w of words(source.replace(/^# .*$/m, "").replace(/^\|[-|\s]+\|$/gm, ""))) {
      const found = have.indexOf(w, at);
      expect(found, `missing or out of order: ${w}`).toBeGreaterThanOrEqual(0);
      at = found + 1;
    }
  });

  it("has the sections in the order they were written, with the guarantee's figures", () => {
    expect(doc.sections.map((s) => s.heading)).toEqual([
      "At a glance", "Client details", "What we do", "Your areas", "Fees and ad spend", "How long it runs and pauses", "Your part",
      "Lead Guarantee", "No other guarantees", "Confidentiality and access", "Data and ownership", "Liability", "Ending the agreement", "General",
    ]);
    expect(JSON.stringify(doc)).toContain("at least **60 qualified leads** during the 90 days");
    expect(doc.sections.find((s) => s.heading === "Your part")!.clauses.filter((c) => c.startsWith("• "))).toHaveLength(9);
    expect(doc.sections.find((s) => s.heading === "At a glance")!.clauses.filter((c) => c.startsWith("• "))).toHaveLength(7);
    expect(doc.initials).toBe(true);
  });
});
