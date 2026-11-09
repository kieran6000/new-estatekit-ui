import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isMobile, prettyPhone, samePhone, toE164, waDigits } from "./phone";

const SAME = [
  "082 668 5452", "0826685452", "82 668 5452", "826685452", "27826685452", "+27826685452",
  "+27 82 668 5452", "+27 082 668 5452", "+27 (0) 82 668 5452", "0027 82 668 5452",
  "082-668-5452", "(082) 668 5452", " 082 668 5452 ", "082.668.5452", "27 082 668 5452",
  "+27 +27826685452", "‎+27 82 668 5452", "082 668 5452 / 083 111 2222", "082 668 5452 or 083 111 2222",
];

describe("phone numbers, however they're typed", () => {
  it.each(SAME)("%s is +27826685452", (typed) => {
    expect(toE164(typed)).toBe("+27826685452");
    expect(waDigits(typed)).toBe("27826685452");
  });

  it("keeps other countries' numbers", () => {
    expect(toE164("+264 85 287 8236")).toBe("+264852878236");
    expect(toE164("264852878236")).toBe("+264852878236");
    expect(toE164("+27 +264 85 287 8236")).toBe("+264852878236");
    expect(toE164("+971 50 123 4567")).toBe("+971501234567");
    expect(toE164("00264852878236")).toBe("+264852878236");
  });

  it("says when something can't be a number", () => {
    for (const bad of ["", "   ", "abc", "082 668", "12345", "+0826685452", "0826685452123456789", null, undefined]) {
      expect(toE164(bad)).toBe("");
      expect(waDigits(bad)).toBe("");
    }
  });

  it("knows a cellphone from an office line", () => {
    expect(isMobile("082 668 5452")).toBe(true);
    expect(isMobile("072 111 2222")).toBe(true);
    expect(isMobile("060 111 2222")).toBe(true);
    expect(isMobile("011 555 1234")).toBe(false);
    expect(isMobile("+264 85 287 8236")).toBe(true);
    expect(isMobile("082 668")).toBe(false);
  });

  it("writes them the way people read them", () => {
    expect(prettyPhone("+27826685452")).toBe("082 668 5452");
    expect(prettyPhone("0826685452")).toBe("082 668 5452");
    expect(prettyPhone("+264852878236")).toBe("+264 852878236");
    expect(prettyPhone("not a number")).toBe("not a number");
  });

  it("matches the same number typed two ways", () => {
    expect(samePhone("082 668 5452", "+27 82 668 5452")).toBe(true);
    expect(samePhone("082 668 5452", "083 668 5452")).toBe(false);
    expect(samePhone("", "")).toBe(false);
  });

  it("gives every number that can sign in today the same account as before", () => {
    // LoginPage's old rules, for comparison: a valid number must still map to the same login.
    const old = (raw: string) => {
      const d = raw.replace(/[\s\-()]/g, "");
      if (d.startsWith("0") && d.length === 10) return "+27" + d.slice(1);
      if (d.startsWith("27") && d.length === 11) return "+" + d;
      if (d.startsWith("+")) return d;
      if (/^\d{9,15}$/.test(d)) return "+" + d;
      return d;
    };
    for (const n of ["0826685452", "082 668 5452", "27826685452", "+27826685452", "+27 82 668 5452", "+264852878236", "264852878236"]) {
      expect(toE164(n)).toBe(old(n));
    }
  });

  it("is the same code the server uses", () => {
    const here = readFileSync("src/lib/phone.ts", "utf8").replace(/\r\n/g, "\n");
    const server = readFileSync("supabase/functions/_shared/phone.ts", "utf8").replace(/\r\n/g, "\n");
    expect(server).toBe(here);
  });
});
