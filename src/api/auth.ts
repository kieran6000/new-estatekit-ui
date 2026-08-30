import { getStore, setStore } from "./_store";

export interface MockUser {
  id: string;
  phone: string;
}

export const DEV_BYPASS_PHONE = "+10000000000";
export const DEV_BYPASS_CODE = "000000";

const SESSION_KEY = "session";
const AGENT_ID = "mock-agent-1";

// TODO: connect backend — replace with real WhatsApp-OTP request + verify.
export async function requestCode(_phone: string): Promise<{ error?: string }> {
  return {};
}

// TODO: connect backend — replace with real OTP verification + session mint.
export async function verifyCode(phone: string, code: string): Promise<{ error?: string; user?: MockUser }> {
  if (phone !== DEV_BYPASS_PHONE || code !== DEV_BYPASS_CODE) {
    return { error: "Mock login: use the pre-filled test phone + code." };
  }
  const user: MockUser = { id: AGENT_ID, phone };
  setStore(SESSION_KEY, user);
  return { user };
}

// TODO: connect backend — replace with real session lookup.
export async function getSession(): Promise<MockUser | null> {
  return getStore<MockUser | null>(SESSION_KEY, null);
}

// TODO: connect backend — replace with real sign-out.
export async function signOut(): Promise<void> {
  setStore<MockUser | null>(SESSION_KEY, null);
}
