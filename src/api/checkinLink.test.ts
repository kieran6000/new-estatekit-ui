import { describe, expect, it } from "vitest";
import { checkinIdOf, checkinLink } from "./checkins";

describe("a to-do's link to its check-in", () => {
  const id = "7862164d-e0a6-4983-808a-628539ee93ff";
  it("is an https address the notes table accepts, and reads back", () => {
    const link = checkinLink("agent-1", id);
    expect(link).toMatch(/^https:\/\//);
    expect(checkinIdOf(link)).toBe(id);
  });
  it("ignores ordinary links", () => {
    expect(checkinIdOf("https://example.com/page")).toBeNull();
    expect(checkinIdOf(null)).toBeNull();
  });
});
