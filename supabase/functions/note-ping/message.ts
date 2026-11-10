// The WhatsApp a teammate gets when a to-do or note is given to them. It has
// to read like a person typed it on their phone: no emoji headers, no bold
// labels, no long link. Kept apart from index.ts so it can be tested.

/** The note as plain words. Links keep their words; a screenshot is mentioned. */
export function plainText(html: string): { text: string; pictures: number } {
  const pictures = (html.match(/<img\b/gi) ?? []).length;
  const text = html
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<\/(p|div|li)>|<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return { text, pictures };
}

/** "today", "tomorrow", "Thursday" (this week), or "Thu 20 Nov". */
export function byWhen(due: string, today: string): string {
  const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const days = Math.round((day(due) - day(today)) / 86_400_000);
  const d = new Date(day(due));
  if (days < 0) return `${d.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long" })} (that's passed already)`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return d.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long" });
  return d.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
}

export interface PingInput {
  kind: "todo" | "note";
  to: string; // their first name
  from: string; // who gave it, first name
  client: string; // "Jaco Maartens"
  body: string; // the note's HTML
  due: string | null; // "2026-11-12"
  today: string; // "2026-11-10", in South Africa
  num: number | null; // 42 → "#42"
  link: string; // https://leads.estatekit.co/t/42
}

export function pingMessage(p: PingInput): string {
  const { text, pictures } = plainText(p.body);
  const words = text.length > 500 ? text.slice(0, 500).trimEnd() + "..." : text;
  const ref = p.num ? ` (#${p.num})` : "";
  const ask = p.kind === "todo"
    ? p.due ? `yo please do this for ${p.client} by ${byWhen(p.due, p.today)}${ref}:` : `yo please do this for ${p.client}${ref}:`
    : `yo a note on ${p.client}${ref}:`;
  const pics = pictures ? `\n(${pictures === 1 ? "screenshot" : `${pictures} screenshots`} in the link)` : "";
  return `${ask}\n\n${words}${pics}\n\n${p.link}\n\nThanks`;
}
