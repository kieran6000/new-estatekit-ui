import { describe, expect, it } from "vitest";
import { days, isWeekendSA } from "./CallTimeStep";

const friday = new Date(2026, 10, 6, 9, 0);
const labels = (noWeekends: boolean) => days(friday, noWeekends).map((d) => d.value.split(" ")[0]);

describe("call-time days", () => {
  it("offers all 7 days by default", () => {
    expect(labels(false)).toEqual(["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"]);
  });

  it("leaves out Saturday and Sunday when asked", () => {
    expect(labels(true)).toEqual(["Fri", "Mon", "Tue", "Wed", "Thu"]);
  });
});

describe("isWeekendSA", () => {
  it("goes by South African time", () => {
    expect(isWeekendSA(new Date("2026-11-06T21:59:00Z"))).toBe(false); // Fri 23:59
    expect(isWeekendSA(new Date("2026-11-06T22:00:00Z"))).toBe(true); // Sat 00:00
    expect(isWeekendSA(new Date("2026-11-08T21:59:00Z"))).toBe(true); // Sun 23:59
    expect(isWeekendSA(new Date("2026-11-08T22:00:00Z"))).toBe(false); // Mon 00:00
  });
});
