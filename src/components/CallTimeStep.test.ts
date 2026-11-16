import { describe, expect, it } from "vitest";
import { days, isWeekendSA } from "./CallTimeStep";

const friday = new Date(2026, 10, 6, 9, 0);
const labels = (noWeekends: boolean) => days(friday, noWeekends).map((d) => d.value.split(" ")[0]);

describe("call-time days", () => {
  it("offers the next 4 days, no further: a call days away isn't picked up", () => {
    expect(labels(false)).toEqual(["Fri", "Sat", "Sun", "Mon"]);
  });

  it("leaves out Saturday and Sunday when asked, still 4 days to pick", () => {
    expect(labels(true)).toEqual(["Fri", "Mon", "Tue", "Wed"]);
  });

  it("starts tomorrow once today is too late", () => {
    expect(days(new Date(2026, 10, 6, 18, 30)).map((d) => d.value.split(" ")[0])).toEqual(["Sat", "Sun", "Mon", "Tue"]);
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
