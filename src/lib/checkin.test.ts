import { describe, expect, it } from "vitest";
import { askForReview, checkinMessage, checkinState, cleanQuestions, daysAgo, DEFAULT_QUESTIONS, scoreCheckin, whatTheySaid, type CheckinAnswers } from "./checkin";

const a = (quality: number, volume: number, followup: number, confidence: number, happiness: number): CheckinAnswers => ({ quality, volume, followup, confidence, happiness });

describe("check-in score", () => {
  // The team's own sheet, row by row.
  it("matches the colours on the Weekly Check-In sheet", () => {
    expect(scoreCheckin(a(4, 4, 5, 4, 5))).toMatchObject({ average: 4.4, risk: "green" });
    expect(scoreCheckin(a(1, 1, 5, 1, 1))).toMatchObject({ average: 1.8, risk: "red" });
    expect(scoreCheckin(a(5, 5, 1, 5, 5))).toMatchObject({ average: 4.2, risk: "amber" });
    expect(scoreCheckin(a(2, 2, 4, 4, 3))).toMatchObject({ average: 3, risk: "amber" });
  });
  it("calls it red when they're unhappy with us, whatever else", () => {
    expect(scoreCheckin(a(5, 5, 5, 5, 2)).risk).toBe("red");
  });
  it("works with questions the team added, and ignores written answers", () => {
    const qs = [...DEFAULT_QUESTIONS, { id: "qx", type: "rating" as const, label: "Speed of replies?", short: "Replies", low: "Slow", high: "Fast" }];
    expect(scoreCheckin({ ...a(4, 4, 4, 4, 4), qx: 1, better: "faster" }, qs)).toMatchObject({ average: 3.5, weak: ["qx"] });
  });
});

describe("questions the team changed", () => {
  it("keeps good ones and drops broken ones", () => {
    const qs = cleanQuestions([{ id: "a", type: "rating", label: "Leads?" }, { id: "", label: "no id" }, { id: "a", label: "duplicate" }, { id: "b", type: "text", label: "Anything else?" }]);
    expect(qs.map((q) => q.id)).toEqual(["a", "b"]);
    expect(qs[0]).toMatchObject({ short: "Leads?", low: "Poor", high: "Great" });
  });
  it("falls back to the standard questions", () => {
    expect(cleanQuestions(null)).toBe(DEFAULT_QUESTIONS);
    expect(cleanQuestions([])).toBe(DEFAULT_QUESTIONS);
  });
  it("finds what they said, from the comment or a written answer", () => {
    expect(whatTheySaid({ better: "More leads" }, DEFAULT_QUESTIONS)).toBe("More leads");
    expect(whatTheySaid({}, DEFAULT_QUESTIONS, "From the old form")).toBe("From the old form");
  });
});

describe("where a client is up to", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  const row = (created: string, shared: string | null, answered: string | null) => ({ created_at: created, shared_at: shared, answered_at: answered, expires_at: "2026-12-30T00:00:00Z" });
  it("only counts a check-in as sent once someone says so", () => {
    const s = checkinState([row("2026-11-09T09:00:00Z", null, null)], now);
    expect(s.draft).not.toBeNull();
    expect(s.waiting).toBeNull();
    expect(s.sentCount).toBe(0);
  });
  it("shows what's waiting, and how many they've answered of those sent", () => {
    const s = checkinState([row("2026-11-08T09:00:00Z", "2026-11-08T09:05:00Z", null), row("2026-10-20T09:00:00Z", "2026-10-20T09:05:00Z", "2026-10-21T09:00:00Z"), row("2026-10-01T09:00:00Z", "2026-10-01T09:00:00Z", null)], now);
    expect(s.waiting?.created_at).toBe("2026-11-08T09:00:00Z");
    expect(s.sentCount).toBe(3);
    expect(s.answeredCount).toBe(1);
    expect(s.lastAnswered?.answered_at).toBe("2026-10-21T09:00:00Z");
  });
  it("says how long ago, in South African days", () => {
    expect(daysAgo("2026-11-09T06:00:00Z", now)).toBe("today");
    expect(daysAgo("2026-11-08T06:00:00Z", now)).toBe("yesterday");
    expect(daysAgo("2026-10-28T06:00:00Z", now)).toBe("12 days ago");
  });
});

describe("the WhatsApp message", () => {
  it("is short and has the link on its own line", () => {
    expect(checkinMessage("Juani", "Khushil", "https://x/k/1")).toBe("Hi Juani, it's Khushil from EstateKit. Quick check-in: it takes a minute, just tap a face for each, no typing needed.\nhttps://x/k/1");
  });
});

describe("asking for a Google review", () => {
  const all = (n: number): CheckinAnswers => ({ quality: n, volume: n, followup: n, confidence: n, happiness: n });
  it("only asks after a really good check-in", () => {
    expect(askForReview(all(5))).toBe(true);
    expect(askForReview({ ...all(5), volume: 4, quality: 4 })).toBe(true);
    expect(askForReview(all(4))).toBe(false);
    expect(askForReview({ ...all(5), happiness: 4 })).toBe(false);
    expect(askForReview({ ...all(5), followup: 3 })).toBe(false);
    expect(askForReview({ quality: 5 })).toBe(false);
  });
});
