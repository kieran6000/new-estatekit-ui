import { describe, expect, it } from "vitest";
import { checkinMessage, nextStep, scoreCheckin, type CheckinAnswers } from "./checkin";

const a = (quality: number, volume: number, followup: number, confidence: number, happiness: number): CheckinAnswers => ({ quality, volume, followup, confidence, happiness });

describe("check-in score", () => {
  // The team's own sheet, row by row.
  it("matches the colours on the Weekly Check-In sheet", () => {
    expect(scoreCheckin(a(4, 4, 5, 4, 5))).toMatchObject({ average: 4.4, risk: "green" }); // Naude 30 Oct
    expect(scoreCheckin(a(1, 1, 5, 1, 1))).toMatchObject({ average: 1.8, risk: "red" }); // Hennie
    expect(scoreCheckin(a(5, 5, 1, 5, 5))).toMatchObject({ average: 4.2, risk: "amber" }); // Mpokuhle: follow-up 1
    expect(scoreCheckin(a(2, 2, 4, 4, 3))).toMatchObject({ average: 3, risk: "amber" }); // Juani
  });
  it("calls it red when they're unhappy with us, whatever else", () => {
    expect(scoreCheckin(a(5, 5, 5, 5, 2)).risk).toBe("red");
  });
  it("lists the weak areas", () => {
    expect(scoreCheckin(a(2, 2, 4, 4, 3)).weak).toEqual(["quality", "volume", "happiness"]);
  });
});

describe("when to send the next one", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  const row = (created: string, answered: string | null, shared: string | null = created) => ({ created_at: created, shared_at: shared, answered_at: answered, expires_at: "2026-12-30T00:00:00Z" });

  it("asks for the first one", () => {
    expect(nextStep([], now)).toEqual({ kind: "send", reason: "never" });
  });
  it("says it's due a week after the last one", () => {
    expect(nextStep([row("2026-10-30T10:00:00Z", "2026-10-30T12:00:00Z")], now)).toEqual({ kind: "send", reason: "due", days: 10 });
  });
  it("waits for an answer, and suggests a reminder after two days", () => {
    expect(nextStep([row("2026-11-08T10:00:00Z", null)], now)).toMatchObject({ kind: "waiting", remind: false });
    expect(nextStep([row("2026-11-06T10:00:00Z", null)], now)).toMatchObject({ kind: "waiting", remind: true });
  });
  it("is done for the week once answered", () => {
    expect(nextStep([row("2026-11-05T10:00:00Z", "2026-11-05T11:00:00Z")], now)).toEqual({ kind: "done", nextDue: "2026-11-12T10:00:00.000Z" });
  });
});

describe("the WhatsApp message", () => {
  it("is short and has the link on its own line", () => {
    expect(checkinMessage("Juani", "Khushil", "https://x/k/1")).toBe("Hi Juani, it's Khushil from EstateKit. Quick check-in on your week: it takes a minute, just tap the numbers, no typing needed.\nhttps://x/k/1");
  });
});
