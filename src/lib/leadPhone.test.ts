import { describe, expect, it } from "vitest";
import { formatLeadPhone, leadPhoneProblem } from "./leadPhone";

describe("lead page WhatsApp number", () => {
  it("lets real numbers through, however they're typed", () => {
    for (const n of ["082 555 0199", "0825550199", "+27 82 555 0199", "+27825550199", "27825550199", "+27 082 555 0199", "82 555 0199", "071-555-0199", "060 555 0199"]) {
      expect(leadPhoneProblem(n), n).toBeNull();
    }
  });

  it("lets other countries through", () => {
    for (const n of ["+264 85 287 8236", "264852878236", "+971 50 555 0134", "+44 7700 900123", "+1 415 555 0172"]) {
      expect(leadPhoneProblem(n), n).toBeNull();
    }
  });

  it("stops typos", () => {
    expect(leadPhoneProblem("082 555 019")).toBe("short");
    expect(leadPhoneProblem("082424")).toBe("short");
    expect(leadPhoneProblem("0852 555 01993")).toBe("long");
    expect(leadPhoneProblem("+27 82 555 019")).toBe("short");
    expect(leadPhoneProblem("9732555054")).toBe("short");
    expect(leadPhoneProblem("")).toBe("short");
  });

  it("stops landlines and made-up numbers", () => {
    expect(leadPhoneProblem("012 555 0168")).toBe("not_mobile");
    expect(leadPhoneProblem("0509 555 037")).toBe("not_mobile");
    expect(leadPhoneProblem("0000000000")).toBe("not_mobile");
    expect(leadPhoneProblem("0123456789")).toBe("not_mobile");
    expect(leadPhoneProblem("0812345678")).toBe("junk");
    expect(leadPhoneProblem("0820000000")).toBe("junk");
    expect(leadPhoneProblem("0777777777")).toBe("junk");
  });

  it("spaces South African numbers as they're typed", () => {
    expect(formatLeadPhone("0825550199")).toBe("082 555 0199");
    expect(formatLeadPhone("08255")).toBe("082 55");
    expect(formatLeadPhone("+27825550199")).toBe("+27 82 555 0199");
    expect(formatLeadPhone("+27")).toBe("+27");
    expect(formatLeadPhone("085255501993")).toBe("085 255 501993");
    expect(formatLeadPhone("+971501234")).toBe("+971501234");
  });
});
