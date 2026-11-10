import { describe, expect, it } from "vitest";
import { matchSops, slashQuery, SOPS } from "./sops";
import { dueState, dueWords } from "../components/NoteFor";

describe("SOP links", () => {
  it("finds the SOP from what's typed after /", () => {
    expect(matchSops("ad setup")[0].name).toBe("Ad setup");
    expect(matchSops("adsetup")[0].name).toBe("Ad setup");
    expect(matchSops("creative")[0].name).toBe("Creative setup");
    expect(matchSops("landing page")[0].name).toBe("Landing page setup");
    expect(matchSops("qa")[0].name).toBe("Pre-launch QA");
    expect(matchSops("")).toHaveLength(SOPS.length);
  });

  it("every SOP opens its own tab of the doc", () => {
    for (const s of SOPS) expect(s.url).toMatch(/^https:\/\/docs\.google\.com\/document\/d\/[\w-]+\/edit\?tab=t\.[a-z0-9]+$/);
    expect(new Set(SOPS.map((s) => s.url)).size).toBe(SOPS.length);
  });

  it("only a / at the start of a word opens the list", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("Do the /ad set")).toBe("ad set");
    expect(slashQuery("Do the /land")).toBe("land");
    expect(slashQuery("R3,000/month")).toBeNull(); // not a /
    expect(slashQuery("https://example.com/ad")).toBeNull();
    expect(slashQuery("/zzz")).toBeNull(); // nothing matches: the list closes
  });
});

describe("due dates", () => {
  it("says late, today or later", () => {
    expect(dueState("2026-11-09", "2026-11-10")).toBe("overdue");
    expect(dueState("2026-11-10", "2026-11-10")).toBe("today");
    expect(dueState("2026-11-11", "2026-11-10")).toBe("later");
  });
  it("reads like a person would say it", () => {
    expect(dueWords("2026-11-10", "2026-11-10")).toBe("Today");
    expect(dueWords("2026-11-11", "2026-11-10")).toBe("Tomorrow");
    expect(dueWords("2026-11-13", "2026-11-10")).toBe("Fri 13 Nov");
  });
});
