import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getCurrentUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return "00000000-0000-0000-0000-000000000000";
  return session.user.id;
}

// Managing another agent is an in-session action ONLY. It is deliberately not
// persisted: a stale "managing Zainub" flag surviving into a fresh login made
// the operator's own account appear to "become" that agent and risked writes
// landing on the wrong profile. A reload / new session always starts as you.
let _activeAgentId: string | null = null;

// Clean up the old persisted value from any browser that still has it.
try { localStorage.removeItem("estatekit_active_agent"); } catch { /* ignore */ }

export function setActiveAgent(id: string | null): void {
  _activeAgentId = id;
}

export function getActiveAgentIdSync(): string | null {
  return _activeAgentId;
}

export async function getActiveAgentId(): Promise<string> {
  if (_activeAgentId) return _activeAgentId;
  return getCurrentUserId();
}

export async function listAgentProfiles(): Promise<
  { agent_id: string; display_name: string | null; whatsapp_number: string | null; area: string | null; company: string | null; sidebar_logo_url: string | null }[]
> {
  const { data, error } = await supabase
    .from("agent_profiles")
    .select("agent_id, display_name, whatsapp_number, area, company, sidebar_logo_url")
    .order("display_name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
