/** A forward-looking, plain-English time: "Today at 14:00", "Tomorrow at 09:30",
 *  "Thu 25 Sep at 14:00". Used wherever an agent needs to know *when* something
 *  is happening rather than how long ago it was — "2d" is useless for an
 *  appointment. Returns "" for no/!invalid date. */
export function whenLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
  const time = d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });

  if (days === 0) return `Today at ${time}`;
  if (days === 1) return `Tomorrow at ${time}`;
  if (days === -1) return `Yesterday at ${time}`;
  const date = d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
  if (days < 0) return date;
  return `${date} at ${time}`;
}

/** True when the moment is still ahead of us — an appointment or reminder
 *  worth surfacing, rather than one that's already passed. */
export function isUpcoming(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

/** Compact relative time, e.g. "just now", "5m ago", "3h ago", "2d ago". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
