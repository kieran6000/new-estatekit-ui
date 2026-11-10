import { describe, expect, it } from "vitest";
import { byWhen, pingMessage } from "./message";

const base = {
  kind: "todo" as const, to: "Aldredt", from: "Kieran", client: "Jaco Maartens",
  body: `<div>test&nbsp;<a href="https://docs.google.com/x">Ad setup</a>&nbsp;<a href="https://docs.google.com/y">Creative setup</a>&nbsp;</div><img data-ek-path="a/b.png"><br>`,
  due: "2026-11-12", today: "2026-11-10", num: 42, link: "https://leads.estatekit.co/t/42",
};

describe("the WhatsApp to a teammate", () => {
  it("reads like a person typed it", () => {
    expect(pingMessage(base)).toBe(
      "yo please do this for Jaco Maartens by Thursday (#42):\n\ntest Ad setup Creative setup\n(screenshot in the link)\n\nhttps://leads.estatekit.co/t/42\n\nThanks",
    );
  });
  it("has no emoji, bold or long links", () => {
    const m = pingMessage(base);
    expect(m).not.toMatch(/[*📌📝]|\/clients\/|#note-/u);
  });
  it("a note, and a to-do without a date", () => {
    expect(pingMessage({ ...base, kind: "note", body: "<div>Called him</div>" })).toMatch(/^yo a note on Jaco Maartens \(#42\):\n\nCalled him\n/);
    expect(pingMessage({ ...base, due: null, body: "<div>x</div>" })).toMatch(/^yo please do this for Jaco Maartens \(#42\):/);
  });
  it("says when like a person would", () => {
    expect(byWhen("2026-11-10", "2026-11-10")).toBe("today");
    expect(byWhen("2026-11-11", "2026-11-10")).toBe("tomorrow");
    expect(byWhen("2026-11-13", "2026-11-10")).toBe("Friday");
    expect(byWhen("2026-11-20", "2026-11-10")).toBe("Fri 20 Nov");
  });
});
