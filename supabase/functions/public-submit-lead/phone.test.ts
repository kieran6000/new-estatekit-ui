import { describe, expect, it } from "vitest";
import { cleanLeadPhone } from "./phone";

describe("cleanLeadPhone", () => {
  it("repairs a South African number with the 0 after the country code", () => {
    expect(cleanLeadPhone("+270833553136")).toBe("+27833553136");
    expect(cleanLeadPhone("+27 081 352 2408")).toBe("+27813522408");
  });

  it("puts back a 0 that was left off", () => {
    expect(cleanLeadPhone("846197889")).toBe("+27846197889");
    expect(cleanLeadPhone("82 755 9973 ")).toBe("+27827559973");
  });

  it("takes +27 off someone abroad", () => {
    expect(cleanLeadPhone("+27+264 85 287 8236")).toBe("+264852878236");
  });

  it("keeps everything else as sent", () => {
    for (const n of ["082 555 0199", "+27825550199", "+264 81 876 3256", "+971509284037", "+659288746", "+2778916237", "0824"]) {
      expect(cleanLeadPhone(n)).toBe(n);
    }
  });
});
