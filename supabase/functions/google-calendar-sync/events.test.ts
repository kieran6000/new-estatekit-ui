import { describe, expect, it } from "vitest";
import { desiredEvent, type CalLead } from "./events";

const base: CalLead = {
  id: "lead-1", name: "Thandi Mokoena", phone: "082 555 0199", stage: "Booked", archived: false,
  appointment_at: "2026-10-28T08:00:00Z", call_at: null, form_answers: [{ q: "Property address", a: "14 Oak Avenue, Bryanston" }],
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
    expect(e.description).toContain("https://leads.estatekit.co/leads/lead-1");
  });

  it("a viewing says so", () => {
    expect(desiredEvent({ ...base, stage: "Viewing Booked" }, "appointment")!.summary).toBe("🏠 Viewing: Thandi Mokoena");
  });

  it("no entry once it's no longer booked, archived, or has no time", () => {
    expect(desiredEvent({ ...base, stage: "Mandate Signed" }, "appointment")).toBeNull();
    expect(desiredEvent({ ...base, archived: true }, "appointment")).toBeNull();
    expect(desiredEvent({ ...base, appointment_at: null }, "appointment")).toBeNull();
  });

  it("a picked call time: 15 minutes, gone if they're Lost", () => {
    const lead = { ...base, stage: "New Lead", call_at: "2026-10-28T12:00:00Z" };
    const e = desiredEvent(lead, "call")!;
    expect(e.summary).toBe("📞 Call Thandi Mokoena (they picked this time)");
    expect(e.end.dateTime).toBe("2026-10-28T12:15:00.000Z");
    expect(desiredEvent({ ...lead, stage: "Lost" }, "call")).toBeNull();
  });
});
