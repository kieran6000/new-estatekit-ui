// A call that was started but whose outcome hasn't been logged yet.
//
// The web page can't hear the phone call, but it can tell when the agent
// leaves for the dialer and comes back. We stash the call here on "Call" tap;
// the action page auto-opens the outcome sheet on return, and the Leads page
// shows a "log your call" row so nothing that was left unlogged is lost.

export interface PendingCall {
  leadId: string;
  name: string;
  phone: string;
  startedAt: number; // ms epoch
}

const KEY = "estatekit_pending_call";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // don't haunt them with yesterday's call

export function armPendingCall(c: PendingCall): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* private browsing / storage disabled */
  }
}

export function getPendingCall(): PendingCall | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as PendingCall;
    if (!c?.leadId || typeof c.startedAt !== "number" || Date.now() - c.startedAt > MAX_AGE_MS) {
      clearPendingCall();
      return null;
    }
    return c;
  } catch {
    return null;
  }
}

export function clearPendingCall(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
