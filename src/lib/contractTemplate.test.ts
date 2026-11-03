import { describe, expect, it } from "vitest";
import source from "./contractTemplate.md?raw";
import { buildContract, SIGNATURE_DATE, type ContractTerms } from "./contractTemplate";

const terms: ContractTerms = {
  clientName: " Stephan Dau ",
  agency: "Langdon Real Estate",
  clientId: "",
  email: "contact@grandproperty24.com",
  targetAreas: "Cape Town: City Centre, Gardens",
  plan: "3-month package: R7,500",
  minAdSpend: 70,
};

describe("the service agreement", () => {
  const doc = buildContract(terms);
  const details = doc.sections.find((s) => s.heading === "Client details")!.table!;
  const row = (label: string) => details.rows.find((r) => r[0] === label)!;

  it("fills in the client's details and EstateKit's fixed ones", () => {
    expect(doc.client).toBe("Stephan Dau");
    expect(row("Name")).toEqual(["Name", "Kieran Ouseb", "Stephan Dau"]);
    expect(row("Trading as / Agency")).toEqual(["Trading as / Agency", "EstateKit", "Langdon Real Estate"]);
    expect(row("Email")[1]).toBe("partner@estatekit.co");
    expect(row("Target areas")[2]).toBe("Cape Town: City Centre, Gardens");
    expect(row("Plan")[2]).toBe("3-month package: R7,500");
    expect(row("Minimum daily ad spend")[2]).toBe("R70 per day (at least R70), paid to Meta directly");
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
    expect(doc.sections.map((s) => s.heading)).toEqual(["At a glance", "Client details", "What we do", "Fees and ad spend", "How long it runs", "Your part", "Mandate Guarantee", "No other guarantees", "Liability", "Data and ownership", "Ending the agreement", "General"]);
    expect(JSON.stringify(doc)).toContain("R3,750 on the 3-month package");
    expect(doc.sections.find((s) => s.heading === "Your part")!.clauses.filter((c) => c.startsWith("• "))).toHaveLength(9);
    expect(doc.initials).toBe(true);
  });
});
