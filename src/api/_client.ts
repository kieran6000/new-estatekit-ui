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

let _activeAgentId: string | null = null;

export function setActiveAgent(id: string | null): void {
  _activeAgentId = id;
}

export async function getActiveAgentId(): Promise<string> {
  if (_activeAgentId) return _activeAgentId;
  return getCurrentUserId();
}

export async function listAgentProfiles(): Promise<
  { agent_id: string; display_name: string | null; whatsapp_number: string | null }[]
> {
  const { data, error } = await supabase
    .from("agent_profiles")
    .select("agent_id, display_name, whatsapp_number")
    .order("display_name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
