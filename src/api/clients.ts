import { supabase } from "./_client";

// Admin "Clients" tab. Operator-only: the table and the function both refuse
// anyone else (see supabase/migrations/20260925_0003_client_dossiers.sql).

/** The parts of a client's stored record this app shows. The row holds more
 *  (it was compiled from the CSM sheets); anything not listed here is unused. */
export interface ClientDossier {
  contact: {
    phones: string[];
    emails: string[];
    contactPerson: string | null;
    team: string | null;
    socials: { facebook: string | null; instagram: string | null; linkedin: string | null } | null;
  };
  billing: { status?: string; invoiceDay?: string; lastPayment?: string; nextPayment?: string; plan?: string; notes?: string } | null;
  package: string | null;
  audit: { payment?: string } | null;
  onboarding: { q: string; a: string }[];
  onboardingExtra: { q: string; a: string }[] | null;
  oldDashboard: { targetAreas: string[]; joined: string | null } | null;
}

export interface ClientLive {
  agent_id: string;
  leads_total: number;
  leads_30d: number;
  leads_7d: number;
  last_lead_at: string | null;
  lead_pages: number;
  pipelines: number;
  by_stage: Record<string, number>;
}

export interface ClientProfile {
  agent_id: string;
  display_name: string | null;
  whatsapp_number: string | null;
  email: string;
  area: string;
  company: string;
  avatar_url: string | null;
  sidebar_logo_url: string | null;
  sidebar_color: string | null;
  fb_page_id: string | null;
  fb_ad_account_id: string | null;
  is_operator: boolean;
  onboarded: boolean;
  automations_paused: boolean;
  tier: string;
}

export interface ClientCardRow extends ClientProfile {
  live: ClientLive | null;
}

const PROFILE_COLS =
  "agent_id, display_name, whatsapp_number, email, area, company, avatar_url, sidebar_logo_url, sidebar_color, fb_page_id, fb_ad_account_id, is_operator, onboarded, automations_paused, tier";

/** Everything the grid needs, in two small reads. */
export async function listClients(): Promise<ClientCardRow[]> {
  const [profiles, live] = await Promise.all([
    supabase.from("agent_profiles").select(PROFILE_COLS).eq("is_operator", false).order("display_name"),
    supabase.rpc("client_directory"),
  ]);
  if (profiles.error) throw new Error(profiles.error.message);
  const liveBy = new Map(((live.data ?? []) as ClientLive[]).map((r) => [r.agent_id, r]));
  return (profiles.data as ClientProfile[]).map((p) => ({ ...p, live: liveBy.get(p.agent_id) ?? null }));
}

/** Ad spend over the last 30 days, from Meta. null when there's no ad
 *  account or Meta couldn't be read. */
export async function getSpend30d(adAccountId: string): Promise<number | null> {
  const since = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const { data, error } = await supabase.functions.invoke("fb-ad-insights", { body: { adAccountId, since } });
  if (error || data?.error || data?.note) return null;
  return Object.values((data?.daily ?? {}) as Record<string, number>).reduce((a, b) => a + (Number(b) || 0), 0);
}

/** Cost per lead for the card and header: "R12" or "—" when it can't be
 *  worked out (no spend, no leads, or Meta unreadable). */
export function cplLabel(spend: number | null | undefined, leads: number): string {
  if (!spend || !leads) return "—";
  return "R" + (spend / leads).toFixed(spend / leads < 100 ? 2 : 0);
}

export async function getClient(agentId: string): Promise<{ profile: ClientProfile; live: ClientLive | null; dossier: ClientDossier | null; dossierUpdatedAt: string | null }> {
  const [profile, live, dossier] = await Promise.all([
    supabase.from("agent_profiles").select(PROFILE_COLS).eq("agent_id", agentId).maybeSingle(),
    supabase.rpc("client_directory"),
    supabase.from("client_dossiers").select("data, updated_at").eq("agent_id", agentId).maybeSingle(),
  ]);
  if (profile.error) throw new Error(profile.error.message);
  if (!profile.data) throw new Error("not_found");
  return {
    profile: profile.data as ClientProfile,
    live: ((live.data ?? []) as ClientLive[]).find((r) => r.agent_id === agentId) ?? null,
    dossier: (dossier.data?.data as ClientDossier | undefined) ?? null,
    dossierUpdatedAt: dossier.data?.updated_at ?? null,
  };
}

/** The picture for a client: their photo, then their Facebook page picture,
 *  then their brand logo. */
export function clientPicture(p: Pick<ClientProfile, "avatar_url" | "fb_page_id" | "sidebar_logo_url">): string | undefined {
  if (p.avatar_url) return p.avatar_url;
  if (p.fb_page_id) return `https://graph.facebook.com/${p.fb_page_id}/picture?type=square&width=160&height=160`;
  return p.sidebar_logo_url || undefined;
}
