import { describe, expect, it } from "vitest";
import { leadMatchesSearch } from "./leadSearch";

const lead = { name: "Thandi Mokoena", phone: "+27821234567", email: "thandi@example.com" };
const nam = { name: "Kieran", phone: "+264852878236", email: null };

describe("leadMatchesSearch", () => {
  it("finds a name by any part, any case", () => {
    expect(leadMatchesSearch(lead, "thandi")).toBe(true);
    expect(leadMatchesSearch(lead, "MOKO")).toBe(true);
    expect(leadMatchesSearch(lead, "sipho")).toBe(false);
  });

  it("finds a South African number however it's typed", () => {
    for (const q of ["082 123", "0821234567", "082-123-4567", "+27 82 123", "27821234567", "1234567", "(082) 123"]) {
      expect(leadMatchesSearch(lead, q), q).toBe(true);
    }
    expect(leadMatchesSearch(lead, "083 123")).toBe(false);
  });

  it("finds a Namibian number with its 0 too", () => {
    expect(leadMatchesSearch(nam, "085 287")).toBe(true);
    expect(leadMatchesSearch(nam, "+264 85")).toBe(true);
  });

  it("finds an email", () => {
    expect(leadMatchesSearch(lead, "thandi@")).toBe(true);
    expect(leadMatchesSearch(lead, "example.com")).toBe(true);
  });

  it("doesn't match everyone on one or two digits, or on symbols", () => {
    expect(leadMatchesSearch(lead, "0")).toBe(false);
    expect(leadMatchesSearch(lead, "82")).toBe(false);
    expect(leadMatchesSearch(lead, "+")).toBe(false);
  });

  it("an empty box shows everyone", () => {
    expect(leadMatchesSearch(lead, "   ")).toBe(true);
  });
});
