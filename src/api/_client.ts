import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Stand-in id for "nobody is signed in" so callers always get a uuid-shaped
 *  value. Never matches a real agent, so queries scoped to it return nothing. */
const ANON_USER_ID = "00000000-0000-0000-0000-000000000000";

export async function getCurrentUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return ANON_USER_ID;
  return session.user.id;
}

// Managing another agent survives a refresh, but is scoped to the real signed-in
// user's own id -- not a single shared key. That's what the earlier bug was:
// one unscoped "managing Zainub" flag could survive into a DIFFERENT operator's
// fresh login on the same browser and make their own account "become" Zainub.
// Keying by the real user's id means it can only ever rehydrate for the same
// person who set it, and signing out clears it.
let _activeAgentId: string | null = null;

// Clean up the old unscoped key from any browser that still has it.
try { localStorage.removeItem("estatekit_active_agent"); } catch { /* ignore */ }

function activeAgentKey(realUserId: string): string {
  return `estatekit_active_agent_for_${realUserId}`;
}

export function setActiveAgent(id: string | null): void {
  _activeAgentId = id;
  getCurrentUserId().then((realId) => {
    if (!realId || realId === ANON_USER_ID) return;
    try {
      if (id) localStorage.setItem(activeAgentKey(realId), id);
      else localStorage.removeItem(activeAgentKey(realId));
    } catch { /* private browsing */ }
  });
}

/** Drop the in-memory "managing X" flag without touching anyone's saved choice.
 *
 *  Must run whenever the session ends or a different person signs in. The
 *  localStorage half of this is keyed per real user, but `_activeAgentId` is a
 *  plain module variable that outlives a sign-out: without this, operator A
 *  switching into a client's account and then agent B signing in on the same
 *  tab left B reading A's client's leads. */
export function forgetActiveAgentInMemory(): void {
  _activeAgentId = null;
}

/** Called once the real session is known (see useAuth) so a refresh lands back
 *  on whichever agent this operator was last managing. */
export function restoreActiveAgent(realUserId: string): void {
  try {
    const saved = localStorage.getItem(activeAgentKey(realUserId));
    if (saved) _activeAgentId = saved;
  } catch { /* ignore */ }
}

export function clearActiveAgentFor(realUserId: string): void {
  try { localStorage.removeItem(activeAgentKey(realUserId)); } catch { /* ignore */ }
  _activeAgentId = null;
}

export function getActiveAgentIdSync(): string | null {
  return _activeAgentId;
}

export async function getActiveAgentId(): Promise<string> {
  if (_activeAgentId) return _activeAgentId;
  return getCurrentUserId();
}

export async function listAgentProfiles(): Promise<
  { agent_id: string; display_name: string | null; whatsapp_number: string | null; area: string | null; company: string | null; sidebar_logo_url: string | null; avatar_url?: string | null; fb_ad_account_id: string | null; fb_page_id: string | null }[]
> {
  const { data, error } = await supabase
    .from("agent_profiles")
    .select("agent_id, display_name, whatsapp_number, area, company, sidebar_logo_url, avatar_url, fb_ad_account_id, fb_page_id")
    .order("display_name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
