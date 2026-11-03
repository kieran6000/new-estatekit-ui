import { describe, expect, it } from "vitest";
import { buildInvoice, defaultDueDate, invoiceStatus, longDate, money, whatsappDigits } from "./invoiceTemplate";

describe("invoice wording", () => {
  it("writes money the way the template does", () => {
    expect(money(3000)).toBe("R3 000.00");
    expect(money(950.5)).toBe("R950.50");
    expect(money(1234567)).toBe("R1 234 567.00");
  });

  it("keeps its own copy of the banking details and tidies what was typed", () => {
    const doc = buildInvoice({ name: " Ansunette Ferreira ", agency: "", email: "", phone: "0821234567", item: "Monthly Plan", description: "Fee", period: "1 month", amount: 3000, issueDate: "2026-11-03", dueDate: "2026-11-10" });
    expect(doc.name).toBe("Ansunette Ferreira");
    expect(doc.bank.account).toBe("63184740017");
    expect(doc.terms).toHaveLength(2);
  });

  it("handles dates without slipping a day", () => {
    expect(longDate("2026-11-03")).toBe("3 November 2026");
    expect(defaultDueDate("2026-12-28")).toBe("2027-01-04");
  });

  it("turns South African numbers into WhatsApp ones", () => {
    expect(whatsappDigits("082 123 4567")).toBe("27821234567");
    expect(whatsappDigits("+27 82 123 4567")).toBe("27821234567");
    expect(whatsappDigits("123")).toBe("");
  });
});

describe("where an invoice has got to", () => {
  const base = { paid_at: null, voided_at: null, due_date: "2026-11-10", first_opened_at: null, shared_at: null };
  const at = "2026-11-03T10:00:00Z";

  it.each([
    [{}, "Not sent yet"],
    [{ shared_at: at }, "Sent, not opened"],
    [{ shared_at: at, first_opened_at: at }, "Opened, not paid"],
    [{ due_date: "2026-11-02" }, "Overdue"],
    [{ due_date: "2026-11-02", paid_at: at }, "Paid"],
    [{ due_date: "2026-11-02", voided_at: at }, "Cancelled"],
  ])("%o is %s", (change, label) => {
    expect(invoiceStatus({ ...base, ...change }, "2026-11-03").label).toBe(label);
  });

  it("isn't overdue on the day it's due", () => {
    expect(invoiceStatus({ ...base, due_date: "2026-11-03" }, "2026-11-03").label).toBe("Not sent yet");
  });
});
