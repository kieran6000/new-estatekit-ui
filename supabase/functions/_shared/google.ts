// Google sign-in plumbing shared by google-calendar, google-calendar-callback
// and google-calendar-sync: keys from the vault, tokens sealed at rest, a
// working access token from the stored refresh token, and where the app may
// be sent back to after Google's page.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const CAL_API = "https://www.googleapis.com/calendar/v3";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const APP_ORIGIN = "https://leads.estatekit.co";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Keeps work going after the response is sent (Supabase's EdgeRuntime). */
export function inBackground(p: Promise<unknown>): void {
  const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt) rt.waitUntil(p);
  else p.catch((err) => console.error(err));
}

/** A vault secret (service role only), else an edge-function secret. */
export async function secret(admin: SupabaseClient, name: string): Promise<string> {
  const { data } = await admin.rpc("get_secret", { secret_name: name });
  return (typeof data === "string" && data) || Deno.env.get(name) || "";
}

/** Compares without leaking how much of it matched. */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- Tokens are sealed before they're stored (AES-256-GCM, key
// GOOGLE_TOKEN_KEY in the vault): a copy of the table, a backup or the SQL
// editor shows "v1.…", not a key to someone's calendar. Rows written before
// sealing (plain text) still read.

let keyPromise: Promise<CryptoKey | null> | null = null;
function tokenKey(admin: SupabaseClient): Promise<CryptoKey | null> {
  keyPromise ??= (async () => {
    const hex = await secret(admin, "GOOGLE_TOKEN_KEY");
    if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
    const raw = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  })();
  return keyPromise;
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function seal(admin: SupabaseClient, plain: string): Promise<string> {
  const key = await tokenKey(admin);
  if (!key) throw new Error("GOOGLE_TOKEN_KEY missing");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function unseal(admin: SupabaseClient, stored: string | null | undefined): Promise<string> {
  if (!stored) return "";
  if (!stored.startsWith("v1.")) return stored;
  const key = await tokenKey(admin);
  if (!key) throw new Error("GOOGLE_TOKEN_KEY missing");
  const [, iv, ct] = stored.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct));
  return new TextDecoder().decode(pt);
}

// ---- Access tokens. Google's last about an hour; the refresh token lasts
// until they remove EstateKit from their Google account (or, while the
// Google app is in "Testing", 7 days: it must be published to production).

export interface Conn {
  agent_id: string;
  google_email: string | null;
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null;
  calendar_id: string;
  needs_reconnect: boolean;
  time_zone: string | null;
}
export const CONN_COLUMNS = "agent_id, google_email, refresh_token, access_token, expires_at, calendar_id, needs_reconnect, time_zone";

/** token: use it. gone: Google refused the refresh token (access removed,
 *  password reset, or expired): they must connect again. Neither: Google
 *  didn't answer properly this time; try again later. */
export interface TokenResult { token?: string; gone?: boolean }

export async function accessTokenFor(admin: SupabaseClient, c: Conn): Promise<TokenResult> {
  try {
    if (c.access_token && c.expires_at && Date.parse(c.expires_at) > Date.now() + 60_000) {
      return { token: await unseal(admin, c.access_token) };
    }
  } catch (err) {
    console.error("unseal access token", c.agent_id, err); // fall through to a refresh
  }
  let refresh: string;
  try {
    refresh = await unseal(admin, c.refresh_token);
  } catch (err) {
    console.error("unseal refresh token", c.agent_id, err);
    return {};
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: await secret(admin, "GOOGLE_CLIENT_ID"),
      client_secret: await secret(admin, "GOOGLE_CLIENT_SECRET"),
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  }).catch(() => null);
  if (!res) return {};
  const t = await res.json().catch(() => ({}));
  if (t.error === "invalid_grant") return { gone: true };
  if (!res.ok || !t.access_token) {
    console.error("token refresh", c.agent_id, res.status, t.error);
    return {};
  }
  c.access_token = await seal(admin, t.access_token);
  c.expires_at = new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString();
  const patch: Record<string, string> = { access_token: c.access_token, expires_at: c.expires_at };
  // Google may hand over a new refresh token; the newest one is the one that works.
  if (typeof t.refresh_token === "string" && t.refresh_token) patch.refresh_token = c.refresh_token = await seal(admin, t.refresh_token);
  await admin.from("google_calendar_connections").update(patch).eq("agent_id", c.agent_id);
  return { token: t.access_token };
}

/** Google no longer lets us in: keep the row (the app shows Reconnect), stop
 *  syncing, and clear what the checklist reads. */
export async function markReconnect(admin: SupabaseClient, agentId: string, message: string): Promise<void> {
  await admin.from("google_calendar_connections")
    .update({ needs_reconnect: true, last_error: message, access_token: null, expires_at: null })
    .eq("agent_id", agentId);
  await admin.from("agent_profiles").update({ google_calendar_email: null }).eq("agent_id", agentId);
}

// ---- Where the app is sent back to after Google's page: the live site,
// this app's Vercel previews, or a local dev server. Anything else → live.

export function safeOrigin(o: unknown): string {
  if (typeof o !== "string") return APP_ORIGIN;
  try {
    const u = new URL(o);
    const host = u.hostname;
    if (u.origin === APP_ORIGIN) return APP_ORIGIN;
    if (u.protocol === "https:" && host.endsWith(".vercel.app") && host.includes("estatekit")) return u.origin;
    if (u.protocol === "http:" && (host === "localhost" || host === "127.0.0.1")) return u.origin;
  } catch { /* not a URL */ }
  return APP_ORIGIN;
}

// ---- Where Google sends people back after "Allow". Both addresses reach
// google-calendar-callback; both must be listed on the Google OAuth client.
//  * Supabase's own: works anywhere, but Google's page then says "continue to
//    …supabase.co", and Google's verification asks you to own that domain.
//  * Ours (a rewrite in vercel.json): says leads.estatekit.co, and can be
//    verified. Switched on by the vault secret GOOGLE_REDIRECT_URI set to it,
//    once https://leads.estatekit.co/oauth/google/calendar?ping=1 answers
//    {"ok":true} (proving the rewrite passes Google's ?code=&state= along).

export const CALLBACK_SUPABASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-callback`;
export const CALLBACK_OWN_DOMAIN = `${APP_ORIGIN}/oauth/google/calendar`;

/** The return address new Connects use. */
export async function redirectUri(admin: SupabaseClient): Promise<string> {
  return (await secret(admin, "GOOGLE_REDIRECT_URI")).trim() === CALLBACK_OWN_DOMAIN ? CALLBACK_OWN_DOMAIN : CALLBACK_SUPABASE;
}

/** The return address a Connect started with (Google needs the same one back). */
export function knownRedirect(v: unknown): string {
  return v === CALLBACK_OWN_DOMAIN ? CALLBACK_OWN_DOMAIN : CALLBACK_SUPABASE;
}

export function safePath(p: unknown, fallback = "/account"): string {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") ? p.slice(0, 200) : fallback;
}

/** PKCE (RFC 7636): the verifier stays with us; Google only sees its hash. */
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge: b64url(digest) };
}
const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
