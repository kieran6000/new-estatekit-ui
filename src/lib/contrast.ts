// Pick a legible foreground for a given background, by WCAG relative luminance.
// Same threshold the sidebar uses, so accent-coloured surfaces across the app
// (sidebar, lead-page headers, accent buttons) all read consistently.

function sRGBtoLin(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const c = hex.replace("#", "");
  if (c.length < 6) return 0;
  const r = sRGBtoLin(parseInt(c.slice(0, 2), 16));
  const g = sRGBtoLin(parseInt(c.slice(2, 4), 16));
  const b = sRGBtoLin(parseInt(c.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isLightColor(hex: string): boolean {
  return relativeLuminance(hex) > 0.179;
}

/** Readable ink for text/icons sitting on `bg`. */
export function readableOn(bg: string): string {
  return isLightColor(bg) ? "#111827" : "#ffffff";
}
