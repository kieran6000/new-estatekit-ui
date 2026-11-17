// A Google access token for partner@ (or any Workspace mailbox) via the service
// account's domain-wide delegation — the same key the Gmail function uses
// (GOOGLE_SA_KEY), just a different scope. The funnel booking functions use
// this to read free/busy and create calendar events AS partner@, so there is
// no per-agent OAuth to keep alive.
//
// One-time setup in Google Workspace admin (Security -> API controls ->
// Domain-wide delegation): the service account's Client ID must list the
// Calendar scope below, next to the Gmail one it already has.

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
export const CAL_API = "https://www.googleapis.com/calendar/v3";

const b64url = (u: Uint8Array) =>
  btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s: string) => b64url(new TextEncoder().encode(s));

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const cache = new Map<string, { token: string; exp: number }>();

/** An access token that acts as `subject` (e.g. partner@estatekit.co).
 *  Throws "not-configured" if GOOGLE_SA_KEY is unset, "bad-sa-key" if it
 *  isn't valid JSON — callers turn those into plain messages, never raw. */
export async function saToken(subject: string, scope = CALENDAR_SCOPE): Promise<string> {
  const key = `${subject}|${scope}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;

  const raw = Deno.env.get("GOOGLE_SA_KEY");
  if (!raw) throw new Error("not-configured");
  let sa: { client_email: string; private_key: string };
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error("bad-sa-key");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    sub: subject,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(claims))}`;
  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signingKey, new TextEncoder().encode(unsigned)),
  );
  const assertion = `${unsigned}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`google-auth: ${data.error ?? res.status} ${data.error_description ?? ""}`.trim());
  }
  cache.set(key, { token: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000 });
  return data.access_token;
}

// ---- Time-zone helpers. Africa/Johannesburg is UTC+2 all year (no daylight
// saving), but we derive the offset from the zone so a different zone would
// still work. Two passes settle any DST edge.

export function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - utcMs;
}

/** The UTC instant for a wall-clock time in `tz`. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  let utc = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) utc = Date.UTC(y, m - 1, d, hh, mm) - tzOffsetMs(utc, tz);
  return new Date(utc);
}

/** Parts of a UTC instant as seen in `tz`: y, m, d, weekday key, HH:MM. */
export function partsInTz(utcMs: number, tz: string): { y: number; m: number; d: number; wd: string; hhmm: string } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  const wd = { Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat" }[p.weekday] ?? "mon";
  return { y: +p.year, m: +p.month, d: +p.day, wd, hhmm: `${p.hour}:${p.minute}` };
}
