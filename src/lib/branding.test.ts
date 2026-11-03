import { describe, expect, it } from "vitest";
import { accentOnVideo, accentOnWhite, contrastRatio, readableOn, softInkOn } from "./contrast";
import { findLogoBounds, logoPlate } from "./logo";

// White, pale, mid-tone and dark, including colours agents have really picked.
const COLOURS = ["#ffffff", "#eedcaa", "#d0b56d", "#fe974d", "#a07633", "#c19015", "#0db1e3", "#0086ff", "#00a86b", "#6366f1", "#581313", "#111827", "#000000"];

describe("any colour an agent picks stays readable", () => {
  it.each(COLOURS)("%s", (c) => {
    expect(contrastRatio(readableOn(c), c)).toBeGreaterThanOrEqual(4.2);
    expect(contrastRatio(softInkOn(c), c)).toBeGreaterThanOrEqual(4.2);
    expect(contrastRatio(accentOnWhite(c), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(accentOnVideo(c), "#000000")).toBeGreaterThanOrEqual(3);
  });

  it("leaves a colour that already reads on white alone", () => {
    expect(accentOnWhite("#1a3c66")).toBe("#1a3c66");
  });
});

/** A w x h picture of one colour with a block of another inside it. */
function picture(w: number, h: number, bg: number[], block: { x: number; y: number; w: number; h: number; c: number[] }) {
  const data = new Array<number>(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = x >= block.x && x < block.x + block.w && y >= block.y && y < block.y + block.h;
      (inside ? block.c : bg).forEach((v, i) => { data[(y * w + x) * 4 + i] = v; });
    }
  }
  return data;
}

describe("finding the logo inside its margin", () => {
  const block = { x: 30, y: 20, w: 40, h: 10 };

  it("cuts a see-through margin", () => {
    const b = findLogoBounds(picture(100, 60, [0, 0, 0, 0], { ...block, c: [10, 20, 30, 255] }), 100, 60);
    expect(b).toEqual({ ...block, background: null });
  });

  it("cuts a solid margin and remembers its colour", () => {
    const b = findLogoBounds(picture(100, 60, [255, 255, 255, 255], { ...block, c: [10, 20, 30, 255] }), 100, 60);
    expect(b).toEqual({ ...block, background: "#ffffff" });
  });

  it("finds nothing in an empty picture", () => {
    expect(findLogoBounds(picture(20, 20, [0, 0, 0, 0], { x: 0, y: 0, w: 0, h: 0, c: [] }), 20, 20)).toBeNull();
  });

  it("leaves a picture alone when its corners all differ", () => {
    const d = picture(4, 4, [120, 120, 120, 255], { x: 0, y: 0, w: 0, h: 0, c: [] });
    [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]].forEach((c, i) => {
      const at = [0, 3, 12, 15][i] * 4;
      c.forEach((v, j) => { d[at + j] = v; });
    });
    expect(findLogoBounds(d, 4, 4)).toBeNull();
  });
});

describe("a logo that would vanish gets a plate", () => {
  it("white logo on a white sidebar: dark plate", () => {
    expect(logoPlate(["#ffffff", "#fefefe"], "#ffffff")).toBe("#111827");
  });
  it("dark logo on a dark sidebar: white plate", () => {
    expect(logoPlate(["#111111", "#000000"], "#111827")).toBe("#ffffff");
  });
  it("a logo that already shows: no plate", () => {
    expect(logoPlate(["#ffffff"], "#111827")).toBeNull();
  });
});
