// Pick a legible foreground for a given background, by WCAG relative luminance.
// Agents can choose any colour, white included, so everything painted with or
// on their colour goes through here: the sidebar, lead-page headers, accent
// buttons, avatars.

const INK = "#111827";
const WHITE = "#ffffff";

function sRGBtoLin(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function channels(hex: string): [number, number, number] | null {
  const c = hex.replace("#", "");
  if (c.length < 6) return null;
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

export function relativeLuminance(hex: string): number {
  const c = channels(hex);
  if (!c) return 0;
  return 0.2126 * sRGBtoLin(c[0]) + 0.7152 * sRGBtoLin(c[1]) + 0.0722 * sRGBtoLin(c[2]);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** True when dark ink reads better on it than white does. */
export function isLightColor(hex: string): boolean {
  return contrastRatio(INK, hex) > contrastRatio(WHITE, hex);
}

/** Readable ink for text/icons sitting on `bg`. */
export function readableOn(bg: string): string {
  return isLightColor(bg) ? INK : WHITE;
}

/** `amount` of `a` blended into `b`, 0 to 1. */
function mix(a: string, b: string, amount: number): string {
  const x = channels(a);
  const y = channels(b);
  if (!x || !y) return a;
  return "#" + x.map((v, i) => Math.round(v * amount + y[i] * (1 - amount)).toString(16).padStart(2, "0")).join("");
}

/** Quieter text on `bg` that still reads. Mid-tones (gold, teal) leave no room
 *  to soften, so there it stays at full strength. */
export function softInkOn(bg: string): string {
  const ink = readableOn(bg);
  for (const amount of [0.7, 0.8, 0.9]) {
    const soft = mix(ink, bg, amount);
    if (contrastRatio(soft, bg) >= 4.5) return soft;
  }
  return ink;
}

/** The accent as text, an icon or a line on a white card: darkened only as far
 *  as it takes to be seen, so a white or pale accent never disappears. */
export function accentOnWhite(accent: string): string {
  if (!channels(accent)) return accent;
  for (let amount = 1; amount > 0; amount -= 0.1) {
    const c = mix(accent, INK, amount);
    if (contrastRatio(c, WHITE) >= 4.5) return c;
  }
  return INK;
}

/** A hairline for something filled with the accent, when it would otherwise
 *  melt into a white card. */
export function accentEdge(accent: string): string {
  return contrastRatio(accent, WHITE) < 1.5 ? "inset 0 0 0 1px rgba(0,0,0,.24)" : "none";
}

/** The accent as a thin bar over a video, which is mostly dark. */
export function accentOnVideo(accent: string): string {
  return contrastRatio(accent, "#000000") < 3 ? WHITE : accent;
}

/** A button filled with the accent. */
export function accentButton(accent: string) {
  const boxShadow = accentEdge(accent);
  return { bgcolor: accent, color: readableOn(accent), boxShadow, "&:hover": { bgcolor: accent, boxShadow, filter: "brightness(0.9)" } };
}
