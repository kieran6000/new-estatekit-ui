import { describe, expect, it } from "vitest";
import { calendarItems, overdue, weekDays, weekStart } from "./calendar";
import type { LeadRow } from "../types";

const lead = (p: Partial<LeadRow>): LeadRow => ({
  id: "l" + Math.random(), agent_id: "a", pipeline_id: null, source_page_id: null, name: "Thandi", phone: "0825550199", email: null,
  stage: "New Lead", next_label: "", reminder_at: null, due: false, form_answers: [], note: "", commission: null,
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", archived: false, ...p,
} as LeadRow);

describe("the Calendar tab", () => {
  it("appointments, viewings, picked call times and due follow-ups, in time order", () => {
    const items = calendarItems([
      lead({ name: "A", stage: "Booked", appointment_at: "2026-10-28T08:00:00Z", reminder_at: "2026-10-28T08:00:00Z", due: true }),
      lead({ name: "B", stage: "Viewing Booked", appointment_at: "2026-10-28T12:00:00Z" }),
      lead({ name: "C", call_at: "2026-10-28T10:00:00Z" } as Partial<LeadRow>),
      lead({ name: "D", stage: "No Answer", reminder_at: "2026-10-28T06:00:00Z", due: true, next_label: "Retry today" }),
    ]);
    expect(items.map((i) => `${i.lead.name}:${i.kind}`)).toEqual(["D:followup", "A:appointment", "C:call", "B:viewing"]);
    // A booked lead's reminder is its appointment, not a second entry.
    expect(items.filter((i) => i.lead.name === "A")).toHaveLength(1);
    expect(items.find((i) => i.kind === "followup")!.label).toBe("Retry today");
  });

  it("a reminder for the same moment as their picked call time is one entry", () => {
    const items = calendarItems([lead({ call_at: "2026-10-27T16:00:00Z", reminder_at: "2026-10-27T16:00:00Z", due: true, next_label: "Call Merle" } as Partial<LeadRow>)]);
    expect(items.map((i) => i.kind)).toEqual(["call"]);
  });

  it("nothing for archived, Lost or won leads", () => {
    expect(calendarItems([
      lead({ stage: "Booked", appointment_at: "2026-10-28T08:00:00Z", archived: true }),
      lead({ stage: "Lost", call_at: "2026-10-28T10:00:00Z", reminder_at: "2026-10-28T06:00:00Z" } as Partial<LeadRow>),
      lead({ stage: "Mandate Signed", appointment_at: "2026-10-28T08:00:00Z", reminder_at: "2026-10-29T08:00:00Z" }),
      lead({ stage: "Bought", reminder_at: "2026-10-29T08:00:00Z" }),
    ])).toEqual([]);
  });

  it("'Spoke, following up in 2 days' is on that day, though it's not on the call list yet (as in Google Calendar)", () => {
    const items = calendarItems([lead({ name: "S", stage: "Contacted", due: false, next_label: "Follow up in 2 days", reminder_at: "2026-11-06T15:45:00Z" })]);
    expect(items.map((i) => `${i.lead.name}:${i.kind}:${i.label}`)).toEqual(["S:followup:Follow up in 2 days"]);
  });

  it("weeks start on Monday; overdue = follow-ups before today that are still on the call list", () => {
    expect(weekStart(new Date(2026, 9, 29)).getDate()).toBe(26); // Wed 29 Oct → Mon 26 Oct
    expect(weekStart(new Date(2026, 10, 1)).getDate()).toBe(26); // Sun 1 Nov → Mon 26 Oct
    const items = calendarItems([
      lead({ reminder_at: new Date(2026, 9, 20, 9).toISOString(), due: true }),
      lead({ reminder_at: new Date(2026, 9, 27, 9).toISOString(), due: true }),
      // Past, but not due any more: on its day, not nagged about.
      lead({ stage: "Contacted", reminder_at: new Date(2026, 9, 19, 9).toISOString(), due: false }),
    ]);
    expect(overdue(items, new Date(2026, 9, 27, 12))).toHaveLength(1);
    expect(weekDays(items, weekStart(new Date(2026, 9, 27))).find((d) => d.items.length)!.day.getDate()).toBe(27);
  });
});

describe("their own Google events on the grid", () => {
  it("a timed event takes its part of each day; past midnight it's cut there", async () => {
    const { spanOnDay } = await import("./calendar");
    const day = new Date(2026, 10, 6);
    expect(spanOnDay(new Date(2026, 10, 6, 9, 30).toISOString(), new Date(2026, 10, 6, 10, 15).toISOString(), day)).toEqual({ start: 570, end: 615 });
    const lateStart = new Date(2026, 10, 6, 23).toISOString();
    const nextMorning = new Date(2026, 10, 7, 1).toISOString();
    expect(spanOnDay(lateStart, nextMorning, day)).toEqual({ start: 1380, end: 1440 });
    expect(spanOnDay(lateStart, nextMorning, new Date(2026, 10, 7))).toEqual({ start: 0, end: 60 });
    expect(spanOnDay(lateStart, nextMorning, new Date(2026, 10, 8))).toBeNull();
    // Too short to tap: at least 15 minutes, never past midnight.
    expect(spanOnDay(new Date(2026, 10, 6, 23, 55).toISOString(), new Date(2026, 10, 6, 23, 56).toISOString(), day)).toEqual({ start: 1435, end: 1440 });
  });

  it("all-day events cover their days (Google's end date is the day after)", async () => {
    const { allDayCovers } = await import("./calendar");
    expect(allDayCovers("2026-11-06", "2026-11-07", new Date(2026, 10, 6))).toBe(true);
    expect(allDayCovers("2026-11-06", "2026-11-07", new Date(2026, 10, 7))).toBe(false);
    expect(allDayCovers("2026-11-06", "2026-11-09", new Date(2026, 10, 8))).toBe(true);
  });

  it("ours and theirs share the width where they overlap", async () => {
    const { layoutBlocks } = await import("./calendar");
    const placed = layoutBlocks([{ start: 600, end: 660, id: "ours" }, { start: 630, end: 690, id: "theirs" }, { start: 700, end: 760, id: "later" }]);
    expect(placed.map((p) => `${p.id} ${p.lane}/${p.lanes}`)).toEqual(["ours 0/2", "theirs 1/2", "later 0/1"]);
  });
});

describe("calendar blocks", () => {
  it("overlapping blocks sit side by side; the next free time starts full width again", async () => {
    const { layoutDay } = await import("./calendar");
    const at = (h: number, m = 0) => new Date(2026, 9, 28, h, m);
    const mk = (kind: "appointment" | "call", d: Date) => ({ lead: lead({}), kind, at: d, label: "" });
    const placed = layoutDay([mk("appointment", at(10)), mk("call", at(10, 30)), mk("appointment", at(14))]);
    expect(placed.map((p) => `${p.start}-${p.end} ${p.lane}/${p.lanes}`)).toEqual(["600-660 0/2", "630-645 1/2", "840-900 0/1"]);
  });
});
