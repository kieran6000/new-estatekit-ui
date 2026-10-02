// WCAG contrast check for the light and dark tokens in src/index.css.
// Run: npm run check:contrast. Fails (exit 1) if any pair is below its bar:
// 4.5:1 for text, 3:1 for icons, borders of inputs and other non-text UI.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

function block(selector) {
  const i = css.indexOf(selector + " {");
  if (i < 0) throw new Error(`No ${selector} block in index.css`);
  const body = css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

function parse(c) {
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)).concat(1);
  m = c.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(",").map((x) => parseFloat(x));
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  throw new Error(`Can't parse colour ${c}`);
}
const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function ratio(fg, bg) {
  const b = parse(bg);
  const f = over(parse(fg), b);
  const [hi, lo] = [lum(f), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5, UI = 3;
const surfaces = ["bg", "surface", "surface2", "raised", "hover"];
const checks = [];
const add = (fg, bgs, min, why) => [].concat(bgs).forEach((bg) => checks.push({ fg, bg, min, why }));

add("ek-ink", surfaces, TEXT, "body text");
add("ek-ink2", surfaces, TEXT, "secondary text");
add("ek-ink3", ["bg", "surface", "raised"], TEXT, "hint text");
for (const c of ["primary", "green", "greenDark", "red", "amber", "orange", "purple", "teal"]) add(`ek-${c}`, ["surface", "raised", "bg"], TEXT, `${c} text`);
add("ek-primary", "primaryBg", TEXT, "selected / primary chip");
add("ek-green", "greenTint", TEXT, "green chip");
add("ek-greenDark", "greenTint", TEXT, "green chip");
add("ek-red", "redTint", TEXT, "error box");
add("ek-amber", "amberTint", TEXT, "warning box");
add("ek-purple", "purpleTint", TEXT, "purple chip");
add("ek-ink", ["amberTint", "primaryBg", "greenTint"], TEXT, "text on tinted rows");
add("ek-ink2", ["amberTint", "primaryBg"], TEXT, "secondary text on tinted rows");
add("ek-onPrimary", "primary", TEXT, "text on primary buttons");
add("ek-onPrimary", "primaryDark", TEXT, "text on hovered primary buttons");
add("#ffffff", ["greenCall", "greenCallHover"], TEXT, "Call button text");
add("ek-outline", ["surface", "bg"], UI, "input / control outlines");
add("ek-primary", ["surface", "bg"], UI, "focus rings, selected borders");
add("wa-ink", "wa-out", TEXT, "WhatsApp bubble text");
add("wa-meta", "wa-out", TEXT, "WhatsApp time");
add("wa-link", "wa-out", TEXT, "WhatsApp link");
add("#ffffff", "wa-header", TEXT, "WhatsApp header");

let failed = 0;
for (const scheme of ["light", "dark"]) {
  const t = { ...block(":root,\n[data-theme=\"light\"]"), ...(scheme === "dark" ? block('[data-theme="dark"]') : {}) };
  const val = (k) => (k.startsWith("#") ? k : t[k] ?? t[`ek-${k}`] ?? (() => { throw new Error(`No token ${k}`); })());
  console.log(`\n${scheme.toUpperCase()}`);
  for (const c of checks) {
    const r = ratio(val(c.fg), val(c.bg));
    const ok = r >= c.min;
    if (!ok) failed++;
    console.log(`${ok ? "  ok  " : "  FAIL"} ${r.toFixed(2).padStart(5)}:1 (min ${c.min})  ${c.fg} on ${c.bg}  · ${c.why}`);
  }
}
// MUI's palettes in src/theme.ts: filled buttons/chips (contrastText on
// main) and coloured text (main on the paper and page backgrounds).
const themeSrc = readFileSync(new URL("../src/theme.ts", import.meta.url), "utf8");
for (const [name, start] of [["light", "const lightPalette"], ["dark", "const darkPalette"]]) {
  const body = themeSrc.slice(themeSrc.indexOf(start), themeSrc.indexOf("};", themeSrc.indexOf(start)));
  const bg = body.match(/background: \{ default: "([^"]+)", paper: "([^"]+)" \}/);
  console.log(`\nMUI ${name.toUpperCase()}`);
  for (const m of body.matchAll(/(\w+): \{ main: "([^"]+)"[^}]*?contrastText: "([^"]+)"/g)) {
    const [, key, main, on] = m;
    const pairs = [[on, main, TEXT, "filled"], [main, bg[2], TEXT, "text on paper"], [main, bg[1], TEXT, "text on page"]];
    for (const [fg, b, min, why] of pairs) {
      const r = ratio(fg.length === 4 ? "#" + [...fg.slice(1)].map((x) => x + x).join("") : fg, b);
      const ok = r >= min;
      if (!ok) failed++;
      console.log(`${ok ? "  ok  " : "  FAIL"} ${r.toFixed(2).padStart(5)}:1 (min ${min})  ${key} ${why}`);
    }
  }
}

console.log(failed ? `\n${failed} pair(s) below WCAG AA.` : "\nAll pairs pass WCAG AA.");
process.exit(failed ? 1 : 0);
