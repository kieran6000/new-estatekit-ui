import { describe, expect, it } from "vitest";
import { calendarNote, whenWords } from "./googleCalendarNote";
import type { CalSyncResult } from "../api/googleCalendar";

const now = new Date(2026, 10, 4, 17, 45); // Wed 4 Nov, 17:45
const r = (kind: CalSyncResult["kind"], action: CalSyncResult["action"], at?: Date): CalSyncResult => ({ lead_id: "l", kind, action, at: at?.toISOString() ?? null });

describe("the Google Calendar line under the snack", () => {
  it("says when it went in, in plain words", () => {
    expect(whenWords(new Date(2026, 10, 4, 19, 0).toISOString(), now)).toBe("Today, 19:00");
    expect(whenWords(new Date(2026, 10, 5, 9, 0).toISOString(), now)).toBe("Tomorrow, 09:00");
    expect(whenWords(new Date(2026, 10, 6, 17, 45).toISOString(), now)).toBe("Fri 6 Nov, 17:45");
  });

  it("'Spoke, following up in 2 days' → in your Google Calendar on that day", () => {
    expect(calendarNote([r("followup", "created", new Date(2026, 10, 6, 17, 45))], { now })).toBe("In your Google Calendar: Fri 6 Nov, 17:45");
  });

  it("booking replaces the follow-up: it talks about the appointment", () => {
    expect(calendarNote([r("followup", "removed"), r("appointment", "created", new Date(2026, 10, 5, 9))], { now }))
      .toBe("In your Google Calendar: Tomorrow, 09:00");
  });

  it("moved, taken out, someone else's calendar", () => {
    expect(calendarNote([r("followup", "moved", new Date(2026, 10, 11, 17, 45))], { now })).toBe("Moved in your Google Calendar: Wed 11 Nov, 17:45");
    expect(calendarNote([r("followup", "removed")], { now })).toBe("Taken out of your Google Calendar");
    expect(calendarNote([r("followup", "created", new Date(2026, 10, 5, 9))], { now, theirs: true })).toBe("In their Google Calendar: Tomorrow, 09:00");
  });

  it("says nothing when their calendar didn't change", () => {
    expect(calendarNote([], { now })).toBeNull();
    expect(calendarNote([r("followup", "none"), r("call", "kept"), r("appointment", "updated", new Date())], { now })).toBeNull();
  });

  it("tells them when Google needs them, and calmly when Google is just slow", () => {
    expect(calendarNote([r("followup", "reconnect")], { now })).toMatch(/reconnecting/);
    expect(calendarNote([r("followup", "retry")], { now })).toMatch(/catch up by itself/);
  });
});
