// When each part of a lead's note was written. Every save is already in the
// lead's history, so a line's date is the first saved version that has it. The
// dates are worked out for showing and are never part of the note itself.

export interface NoteVersion { to_value: string | null; created_at: string }
export interface NoteBlock { text: string; at: string | null }

/** Note saves are logged from this day. Nothing before it can be dated. */
const LOGGED_FROM = "2026-09-13";

const linesOf = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

/** The note split into blocks, each with when it was written. Lines next to each
 *  other from the same save share one date. A note saved with the lead when it
 *  came in has the lead's date. Anything older has no date, rather than a guess. */
export function stampNote(note: string, versions: NoteVersion[], leadCreatedAt?: string | null): NoteBlock[] {
  const oldestFirst = [...versions].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const firstSeen = new Map<string, string>();
  for (const v of oldestFirst) {
    for (const line of linesOf(v.to_value ?? "")) if (!firstSeen.has(line)) firstSeen.set(line, v.created_at);
  }
  const unlogged = !versions.length && !!leadCreatedAt && leadCreatedAt.slice(0, 10) >= LOGGED_FROM ? leadCreatedAt : null;
  const blocks: NoteBlock[] = [];
  for (const raw of note.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const at = firstSeen.get(line) ?? unlogged;
    const last = blocks[blocks.length - 1];
    if (last && last.at === at) last.text += `\n${line}`;
    else blocks.push({ text: line, at });
  }
  return blocks;
}

/** "3 Nov, 14:20", with the year if it isn't this year. In South African time. */
export function noteTime(iso: string, now = new Date()): string {
  const zone = "Africa/Johannesburg";
  const year = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: zone, year: "numeric" });
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { timeZone: zone, day: "numeric", month: "short", ...(year(d) !== year(now) ? { year: "numeric" } : {}) });
  return `${day}, ${d.toLocaleTimeString("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit" })}`;
}
