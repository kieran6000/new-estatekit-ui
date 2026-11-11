import { describe, expect, it } from "vitest";
import { findBand, fitVideo } from "./videoFit";

const round = (r: ReturnType<typeof fitVideo>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 10) / 10]));

describe("fitting a video in the landscape box", () => {
  it("a landscape video fills it", () => {
    expect(round(fitVideo(9 / 16))).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });

  it("an upright video sits in the middle, full height", () => {
    const r = fitVideo(16 / 9);
    expect(Math.round(r.height)).toBe(100);
    expect(Math.round(r.width)).toBe(32);
    expect(Math.round(r.left)).toBe(34);
    expect(Math.round(r.top)).toBe(0);
  });

  it("an upright video with black bands: its square picture fills the box's height", () => {
    // 9:16, picture in the middle 56% (a square), bands above and below.
    const r = fitVideo(16 / 9, { top: 0.22, bottom: 0.78 });
    expect(r.width).toBeCloseTo(56.5, 0); // the square is about 56% of the box wide
    // The band's top lands on the box's top, its bottom on the box's bottom.
    const bandTop = r.top + r.height * 0.22;
    const bandBottom = r.top + r.height * 0.78;
    expect(Math.round(bandTop)).toBe(0);
    expect(Math.round(bandBottom)).toBe(100);
  });
});

describe("finding the black bands", () => {
  it("finds the picture between black rows", () => {
    const rows = 100;
    expect(findBand(rows, (r) => (r >= 20 && r < 80 ? 0.9 : 0))).toEqual({ top: 0.2, bottom: 0.8 });
  });
  it("no bands: the whole picture", () => {
    expect(findBand(50, () => 0.5)).toEqual({ top: 0, bottom: 1 });
  });
  it("a mostly dark picture isn't mistaken for bands", () => {
    expect(findBand(100, (r) => (r >= 45 && r < 55 ? 0.5 : 0))).toEqual({ top: 0, bottom: 1 });
  });
});
