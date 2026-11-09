// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cleanNoteHtml, isEmptyNote, noteForSaving, noteHtml, notePaths } from "./richNote";

describe("formatted notes", () => {
  it("keeps bold, lists and safe links, and drops anything else", () => {
    const out = cleanNoteHtml('<b>Call</b> <script>alert(1)</script><a href="javascript:x">bad</a> <a href="https://x.co">good</a><ul><li>one</li></ul><span style="color:red" onclick="x()">plain</span>');
    expect(out).toContain("<b>Call</b>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("javascript");
    expect(out).toContain('href="https://x.co"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain("<li>one</li>");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("style");
  });

  it("only keeps our own screenshots, and saves them without their link", () => {
    expect(cleanNoteHtml('<img src="https://evil.co/x.png">')).not.toContain("img");
    const saved = noteForSaving('<img data-ek-path="a/b.png" src="https://signed.example/b.png?token=1">');
    expect(saved).toContain('data-ek-path="a/b.png"');
    expect(saved).not.toContain("signed.example");
    expect(notePaths(saved)).toEqual(["a/b.png"]);
  });

  it("shows older plain notes as typed", () => {
    expect(noteHtml("Line one\n<two>")).toBe("Line one<br>&lt;two&gt;");
  });

  it("knows an empty note from one with only a screenshot", () => {
    expect(isEmptyNote("<p><br></p>")).toBe(true);
    expect(isEmptyNote('<img data-ek-path="a.png">')).toBe(false);
  });
});
