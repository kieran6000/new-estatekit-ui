import { describe, expect, it } from "vitest";
import { noteTime, stampNote } from "./noteStamps";

const v = (to_value: string, created_at: string) => ({ to_value, created_at });

describe("note dates", () => {
  it("dates each line from the first save that had it", () => {
    const blocks = stampNote("Busy with one sale\n\nWatched the video", [
      v("Busy with one sale\n\nWatched the video", "2026-11-03T10:00:00Z"),
      v("Busy with one sale", "2026-11-01T08:00:00Z"),
    ]);
    expect(blocks).toEqual([
      { text: "Busy with one sale", at: "2026-11-01T08:00:00Z" },
      { text: "Watched the video", at: "2026-11-03T10:00:00Z" },
    ]);
  });

  it("gives lines from the same save one date", () => {
    expect(stampNote("One\nTwo", [v("One\nTwo", "2026-11-01T08:00:00Z")])).toEqual([{ text: "One\nTwo", at: "2026-11-01T08:00:00Z" }]);
  });

  it("dates an edited line from when it was edited", () => {
    const blocks = stampNote("Call on Friday", [v("Call on Monday", "2026-11-01T08:00:00Z"), v("Call on Friday", "2026-11-02T08:00:00Z")]);
    expect(blocks[0].at).toBe("2026-11-02T08:00:00Z");
  });

  it("isn't fooled by a short line inside a longer one", () => {
    const blocks = stampNote("ok", [v("ok thanks", "2026-11-01T08:00:00Z"), v("ok", "2026-11-02T08:00:00Z")]);
    expect(blocks[0].at).toBe("2026-11-02T08:00:00Z");
  });

  it("uses the lead's date for a note that came with it, and never guesses for older ones", () => {
    expect(stampNote("From the form", [], "2026-10-05T09:00:00Z")[0].at).toBe("2026-10-05T09:00:00Z");
    expect(stampNote("Old note", [], "2026-08-01T09:00:00Z")[0].at).toBeNull();
    expect(stampNote("Old note", [])[0].at).toBeNull();
  });

  it("writes the time simply, in South African time", () => {
    expect(noteTime("2026-11-03T12:20:00Z", new Date("2026-11-04T00:00:00Z"))).toBe("3 Nov, 14:20");
    expect(noteTime("2025-11-03T12:20:00Z", new Date("2026-11-04T00:00:00Z"))).toBe("3 Nov 2025, 14:20");
  });
});
