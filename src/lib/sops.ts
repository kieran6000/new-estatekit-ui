// The team's SOPs: one Google Doc, a tab per step. Type "/" in a to-do or
// note to link one ("/ad setup"); it shows as a chip that opens that tab.

export const SOP_DOC = "https://docs.google.com/document/d/1kIpq0jKAPdkNPNu7Y_QGr4rvrU6OYV--LKid3vSNR08";

export interface Sop { name: string; url: string }

export const SOPS: Sop[] = [
  ["Client onboarding", "t.o75kgu2iags6"],
  ["Creative setup", "t.2u1elbtjvskn"],
  ["Landing page setup", "t.8zvxqctu6ax"],
  ["Ad setup", "t.myer38t65xfm"],
  ["Pixel & tracking", "t.zd4lb57hxqsv"],
  ["Pre-launch QA", "t.j5qfwma4fpn3"],
  ["Ad management", "t.suwcols56bp4"],
].map(([name, tab]) => ({ name, url: `${SOP_DOC}/edit?tab=${tab}` }));

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The SOPs that match what's been typed after "/": "ad", "adset", "landing", "qa". */
export function matchSops(query: string): Sop[] {
  const q = squash(query);
  if (!q) return SOPS;
  const starts = SOPS.filter((s) => squash(s.name).startsWith(q));
  const words = SOPS.filter((s) => !starts.includes(s) && s.name.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.startsWith(q)));
  const inside = SOPS.filter((s) => !starts.includes(s) && !words.includes(s) && squash(s.name).includes(q));
  return [...starts, ...words, ...inside];
}

/** What's just been typed, when it's a "/" asking for an SOP: the words after it. */
export function slashQuery(textBeforeCaret: string): string | null {
  const m = textBeforeCaret.match(/(?:^|[\s ])\/([a-z0-9 &-]{0,24})$/i);
  if (!m) return null;
  return matchSops(m[1]).length ? m[1] : null;
}
