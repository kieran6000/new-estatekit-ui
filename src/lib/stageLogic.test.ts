import { describe, expect, it } from "vitest";
import { compareWhenToCall, whenToCall } from "./stageLogic";

const now = new Date(2026, 10, 2, 12, 0); // Mon 2 Nov 2026, 12:00 local
const ago = (mins: number) => new Date(now.getTime() - mins * 60_000).toISOString();
const inMins = (mins: number) => new Date(now.getTime() + mins * 60_000).toISOString();
const DAY = 24 * 60;

const lead = (p: Partial<Parameters<typeof whenToCall>[0]>) => ({
  stage: "New Lead" as const, next_label: "", created_at: ago(3 * DAY), due: true, reminder_at: null, ...p,
});

describe("whenToCall", () => {
  it("a lead that just came in is Now, for about an hour", () => {
    expect(whenToCall(lead({ next_label: "Just came in", created_at: ago(5) }), now)).toMatchObject({ level: "now", when: "Now", why: "Just came in" });
    expect(whenToCall(lead({ next_label: "Just came in", created_at: ago(90) }), now)).toMatchObject({ level: "today", when: "Today", why: "Not called yet" });
  });

  it("an old untouched lead is Today, not red", () => {
    expect(whenToCall(lead({ next_label: "Just came in", created_at: ago(14 * DAY) }), now).level).toBe("today");
  });

  it("a picked call time counts from that time", () => {
    const picked = { next_label: "Call Emily: they picked this time" };
    expect(whenToCall(lead({ ...picked, call_at: inMins(DAY) }), now)).toMatchObject({ level: "later", when: "Tomorrow, 12:00", why: "They picked this time" });
    expect(whenToCall(lead({ ...picked, call_at: inMins(120) }), now)).toMatchObject({ level: "today", when: "Today, 14:00" });
    expect(whenToCall(lead({ ...picked, call_at: ago(20) }), now)).toMatchObject({ level: "now", when: "Now", why: "They picked 11:40" });
  });

  it("only a picked time that has gone by is missed", () => {
    const w = whenToCall(lead({ next_label: "Call Preya: they picked this time", call_at: ago(3 * DAY) }), now);
    expect(w).toMatchObject({ level: "missed", when: "Missed: Fri 30 Oct, 12:00" });
  });

  it("an appointment that has passed asks how it went, and is not missed", () => {
    const w = whenToCall(lead({ stage: "Booked", next_label: "Appt 30 Oct at 09:00", due: false, appointment_at: ago(3 * DAY) }), now);
    expect(w.level).toBe("today");
    expect(w.why).toBe("Appointment: how did it go?");
  });

  it("an upcoming appointment shows its time", () => {
    const w = whenToCall(lead({ stage: "Booked", next_label: "Appt", due: false, appointment_at: inMins(DAY * 2) }), now);
    expect(w).toMatchObject({ level: "later", when: "Wed 4 Nov, 12:00", why: "Appointment" });
  });

  it("puts the reason in plain words, without the name", () => {
    expect(whenToCall(lead({ stage: "No Answer", next_label: "Retry today", reminder_at: ago(60) }), now)).toMatchObject({ when: "Today", why: "Didn't answer, try again" });
    expect(whenToCall(lead({ next_label: "Call Jan: applied, never picked a time", reminder_at: ago(3 * DAY) }), now)).toMatchObject({ when: "Today", why: "Applied, never picked a time" });
    expect(whenToCall(lead({ stage: "Contacted", next_label: "Follow up tomorrow", due: false, reminder_at: inMins(DAY) }), now)).toMatchObject({ level: "later", when: "Tomorrow", why: "Follow up" });
  });

  it("someone who came back within the hour is Now", () => {
    expect(whenToCall(lead({ next_label: "Call Sam: they came back", reminder_at: ago(10) }), now)).toMatchObject({ level: "now", why: "They came back" });
  });

  it("Lost leads and finished ones have nothing to do", () => {
    expect(whenToCall(lead({ stage: "Lost", next_label: "—", due: false }), now).level).toBe("none");
    expect(whenToCall(lead({ stage: "Mandate Signed", next_label: "—", due: false }), now).level).toBe("none");
  });

  it("orders missed, now, today, later; upcoming soonest first, the rest newest first", () => {
    const missed = whenToCall(lead({ next_label: "Call A: they picked this time", call_at: ago(DAY) }), now);
    const fresh = whenToCall(lead({ next_label: "Just came in", created_at: ago(5) }), now);
    const newer = whenToCall(lead({ next_label: "Just came in", created_at: ago(2 * DAY) }), now);
    const older = whenToCall(lead({ next_label: "Just came in", created_at: ago(9 * DAY) }), now);
    const soon = whenToCall(lead({ next_label: "Call B: they picked this time", call_at: inMins(DAY) }), now);
    const far = whenToCall(lead({ next_label: "Call C: they picked this time", call_at: inMins(5 * DAY) }), now);
    expect([far, older, soon, fresh, newer, missed].sort(compareWhenToCall)).toEqual([missed, fresh, newer, older, soon, far]);
  });
});
