import { callApi, getToken, setToken } from "./_client";

export interface MockUser {
  id: string;
  phone: string;
}

export const DEV_BYPASS_PHONE = "+10000000000";
export const DEV_BYPASS_CODE = "000000";

const SESSION_KEY = "estatekit_session";

export async function requestCode(phone: string): Promise<{ error?: string }> {
  try {
    await callApi("auth.requestCode", { phone });
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function verifyCode(phone: string, code: string): Promise<{ error?: string; user?: MockUser }> {
  try {
    const { user, token, error } = await callApi<{ user?: MockUser; token?: string; error?: string }>(
      "auth.verifyCode",
      { phone, code },
    );
    if (error || !user || !token) return { error: error || "Invalid code." };
    setToken(token);
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return { user };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// Session is kept client-side once minted (matches the original mock's
// semantics) — the token itself is what the backend actually verifies on
// every real request, so there's no separate "check session" round trip.
export async function getSession(): Promise<MockUser | null> {
  if (!getToken()) return null;
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? (JSON.parse(raw) as MockUser) : null;
}

export async function signOut(): Promise<void> {
  setToken(null);
  localStorage.removeItem(SESSION_KEY);
}
