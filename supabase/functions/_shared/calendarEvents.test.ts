import { describe, expect, it } from "vitest";
import { desiredEvent, entryTime, eventIdFor, type CalLead } from "./calendarEvents";

const base: CalLead = {
  id: "0b8e1f2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b", name: "Thandi Mokoena", phone: "082 555 0199", stage: "Booked", archived: false,
  appointment_at: "2026-10-28T08:00:00Z", call_at: null, reminder_at: "2026-10-28T08:00:00Z", next_label: "Appt 28 Oct, 10:00",
  note: "", form_answers: [{ q: "Property address", a: "14 Oak Avenue, Bryanston" }],
};

describe("Google Calendar entries", () => {
  it("a booked appointment: an hour, with the address, number and a link to the lead", () => {
    const e = desiredEvent(base, "appointment")!;
    expect(e.summary).toBe("📅 Appointment: Thandi Mokoena");
    expect(e.location).toBe("14 Oak Avenue, Bryanston");
    expect(e.start.dateTime).toBe("2026-10-28T08:00:00.000Z");
    expect(e.end.dateTime).toBe("2026-10-28T09:00:00.000Z");
    expect(e.start.timeZone).toBe("Africa/Johannesburg");
    expect(e.description).toContain("Phone: 082 555 0199");
    expect(e.description).toContain("https://leads.estatekit.co/leads/" + base.id);
    expect(e.colorId).toBe("7");
    expect(e.reminders.overrides.map((r) => r.minutes)).toEqual([60, 15]);
    expect(e.transparency).toBe("opaque");
  });

  it("a viewing says so; a general pipeline says Meeting", () => {
    const v = desiredEvent({ ...base, stage: "Viewing Booked" }, "appointment")!;
    expect(v.summary).toBe("🏠 Viewing: Thandi Mokoena");
    expect(v.colorId).toBe("3");
    expect(desiredEvent(base, "appointment", { pipelineKind: "general" })!.summary).toBe("📅 Meeting: Thandi Mokoena");
  });

  it("uses the agent's own calendar time zone when Google gave one", () => {
    expect(desiredEvent(base, "appointment", { timeZone: "Asia/Dubai" })!.start.timeZone).toBe("Asia/Dubai");
  });

  it("no appointment once it's no longer booked, archived, or has no time", () => {
    expect(desiredEvent({ ...base, stage: "Mandate Signed" }, "appointment")).toBeNull();
    expect(desiredEvent({ ...base, archived: true }, "appointment")).toBeNull();
    expect(desiredEvent({ ...base, appointment_at: null }, "appointment")).toBeNull();
  });

  it("a picked call time: 15 minutes, gone if they're Lost", () => {
    const lead = { ...base, stage: "New Lead", call_at: "2026-10-28T12:00:00Z", reminder_at: "2026-10-28T12:00:00Z" };
    const e = desiredEvent(lead, "call")!;
    expect(e.summary).toBe("📞 Call Thandi Mokoena (they picked this time)");
    expect(e.end.dateTime).toBe("2026-10-28T12:15:00.000Z");
    expect(e.colorId).toBe("10");
    expect(desiredEvent({ ...lead, stage: "Lost" }, "call")).toBeNull();
  });
});

describe("follow-up reminders (what 'How did it go?' sets)", () => {
  const spoke: CalLead = {
    ...base, stage: "Contacted", appointment_at: null, reminder_at: "2026-11-06T15:45:00Z", next_label: "Follow up in 2 days",
    note: "Wants to sell after December. Ask about the granny flat.",
  };

  it("Spoke, following up: a 15-minute reminder at that time, that doesn't make them look busy", () => {
    const e = desiredEvent(spoke, "followup")!;
    expect(e.summary).toBe("📞 Follow up: Thandi Mokoena");
    expect(e.start.dateTime).toBe("2026-11-06T15:45:00.000Z");
    expect(e.end.dateTime).toBe("2026-11-06T16:00:00.000Z");
    expect(e.transparency).toBe("transparent");
    expect(e.colorId).toBe("11");
    expect(e.reminders.overrides).toEqual([{ method: "popup", minutes: 0 }]);
    expect(e.location).toBeUndefined();
    // Their notes are the point of the call; "Follow up in 2 days" isn't worth repeating.
    expect(e.description).toContain("Notes: Wants to sell after December.");
    expect(e.description).not.toContain("Follow up in 2 days");
    expect(e.extendedProperties.private).toEqual({ estatekit_lead: spoke.id, estatekit_kind: "followup" });
  });

  it("a workflow's own reminder words are kept; a retry says Try again", () => {
    expect(desiredEvent({ ...spoke, next_label: "Call Merle: she asked for a call back" }, "followup")!.description)
      .toContain("Call Merle: she asked for a call back");
    expect(desiredEvent({ ...spoke, stage: "No Answer", next_label: "Retry today" }, "followup")!.summary).toBe("📞 Try again: Thandi Mokoena");
  });

  it("none for Lost, wrong numbers, signed or bought, archived, or no reminder", () => {
    for (const stage of ["Lost", "Invalid Number", "Mandate Signed", "Bought"]) expect(entryTime({ ...spoke, stage }, "followup")).toBeNull();
    expect(entryTime({ ...spoke, archived: true }, "followup")).toBeNull();
    expect(entryTime({ ...spoke, reminder_at: null }, "followup")).toBeNull();
  });

  it("not a second entry when it's the same moment as the appointment or the call time", () => {
    expect(entryTime(base, "followup")).toBeNull(); // Booked: the reminder is the appointment
    expect(entryTime({ ...spoke, stage: "New Lead", call_at: "2026-11-06T15:45:20Z" }, "followup")).toBeNull();
    // A reminder after a past appointment ("how did it go?") is its own entry.
    expect(entryTime({ ...base, reminder_at: "2026-10-29T08:00:00Z" }, "followup")).toBe("2026-10-29T08:00:00Z");
  });

  it("long notes are cut short", () => {
    const e = desiredEvent({ ...spoke, note: "x".repeat(900) }, "followup")!;
    expect(e.description.length).toBeLessThan(700);
    expect(e.description).toContain("…");
  });
});

describe("our own event ids", () => {
  it("are valid Google ids (a–v, 0–9), the same for the same lead, kind and time, and differ otherwise", () => {
    const id = eventIdFor(base.id, "followup", "2026-11-06T15:45:00Z");
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(eventIdFor(base.id, "followup", "2026-11-06T15:45:00.000Z")).toBe(id);
    expect(eventIdFor(base.id, "appointment", "2026-11-06T15:45:00Z")).not.toBe(id);
    expect(eventIdFor(base.id, "followup", "2026-11-07T15:45:00Z")).not.toBe(id);
  });
});
