// Talks to the Apps Script Web App backend. POST body is sent as text/plain
// on purpose — Apps Script Web Apps don't respond to CORS preflight
// (OPTIONS), so a "simple request" (text/plain, no custom headers) is the
// only content-type that avoids a failed preflight from the browser.

const API_URL = import.meta.env.VITE_API_URL as string;
const TOKEN_KEY = "estatekit_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function callApi<T>(action: string, payload: unknown = {}): Promise<T> {
  if (!API_URL) throw new Error("VITE_API_URL is not set");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload, token: getToken() }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json.data as T;
}
