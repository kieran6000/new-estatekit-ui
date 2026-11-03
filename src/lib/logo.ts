// Logos arrive with big empty margins, which is what makes them look tiny once
// they're fitted to a height. This finds the part that is actually the logo.

import { contrastRatio } from "./contrast";

export type LogoBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The colour around the logo, or null when it's see-through. */
  background: string | null;
};

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

/** Reads RGBA pixels. Null when the corners don't share a background (a photo,
 *  say), where there's no margin to cut, or when there's nothing there. */
export function findLogoBounds(data: ArrayLike<number>, width: number, height: number): LogoBounds | null {
  const at = (x: number, y: number) => (y * width + x) * 4;
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  const same = (a: number, b: number) => Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]) <= 48;

  const clear = corners.filter((c) => data[c + 3] < 16).length >= 3;
  const base = clear ? -1 : corners.find((c) => corners.filter((o) => data[o + 3] >= 16 && same(c, o)).length >= 3) ?? -2;
  if (base === -2) return null;
  const isLogo = (i: number) => (clear ? data[i + 3] >= 32 : data[i + 3] >= 16 && !same(i, base));

  // A row or column only counts with more than a speck in it (JPEG noise).
  const rows = new Array<number>(height).fill(0);
  const cols = new Array<number>(width).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isLogo(at(x, y))) { rows[y]++; cols[x]++; }
    }
  }
  const minInRow = Math.max(1, Math.floor(width * 0.002));
  const minInCol = Math.max(1, Math.floor(height * 0.002));
  const top = rows.findIndex((n) => n >= minInRow);
  const left = cols.findIndex((n) => n >= minInCol);
  if (top < 0 || left < 0) return null;
  const bottom = height - 1 - [...rows].reverse().findIndex((n) => n >= minInRow);
  const right = width - 1 - [...cols].reverse().findIndex((n) => n >= minInCol);

  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1, background: clear ? null : hex(data[base], data[base + 1], data[base + 2]) };
}

/** Up to `max` of the logo's own colours, spread evenly across it. */
export function sampleLogoColors(data: ArrayLike<number>, width: number, b: LogoBounds, max = 400): string[] {
  const step = Math.max(1, Math.floor(Math.sqrt((b.w * b.h) / max)));
  const out: string[] = [];
  for (let y = b.y; y < b.y + b.h; y += step) {
    for (let x = b.x; x < b.x + b.w; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] >= 128) out.push(hex(data[i], data[i + 1], data[i + 2]));
    }
  }
  return out;
}

/** The plate a see-through logo needs to be seen on `bg`, or null if it reads
 *  there as it is: a white logo on a white sidebar gets a dark plate. */
export function logoPlate(colors: string[], bg: string): string | null {
  if (!colors.length) return null;
  const seen = colors.filter((c) => contrastRatio(c, bg) >= 2).length;
  if (seen / colors.length >= 0.35) return null;
  const onWhite = colors.filter((c) => contrastRatio(c, "#ffffff") >= 2).length;
  return onWhite / colors.length >= 0.35 ? "#ffffff" : "#111827";
}
