import { supabase } from "./_client";

// Admin "Clients" tab. Operator-only: the table and the function both refuse
// anyone else (see supabase/migrations/20260925_0003_client_dossiers.sql).

export type StatusTone = "red" | "amber" | "green" | "blue" | "grey";

export interface ClientCall {
  source: "Call log" | "Call notes doc";
  date: string | null;
  title?: string;
  ledBy?: string;
  recording?: string | null;
  duration?: string | null;
  status?: string;
  next?: string;
  summary: string;
  actions: string[];
  /** Full Fathom notes. depth -1 is a sub-heading, 1 is a nested bullet. */
  sections: { title: string; items: { text: string; depth: number }[] }[];
}

export interface ClientFeedback {
  date: string;
  leadQuality: number;
  leadVolume: number;
  followUp: number;
  confidence: number;
  happiness: number;
  comment: string;
  risk?: string;
  weak?: string;
}

export interface ClientAd {
  campaign: string;
  adSet: string;
  ad: string;
  status: string;
  spend: string;
  results: number;
  cpl: string;
  start: string;
}

export interface ClientDossier {
  v: number;
  generatedAt: string;
  status: { label: string; tone: StatusTone };
  nextAction: string | null;
  health: string | null;
  todos: string[];
  contact: {
    phones: string[];
    emails: string[];
    contactPerson: string | null;
    team: string | null;
    socials: { facebook: string | null; instagram: string | null; linkedin: string | null } | null;
  };
  billing: { status?: string; invoiceDay?: string; lastPayment?: string; nextPayment?: string; plan?: string; notes?: string } | null;
  package: string | null;
  targetCpl: string | null;
  exclusiveAreas: string[] | null;
  clientMessage: string | null;
  hub: {
    adAccount: string; active: boolean; status: string; activeAds: number; spend: string; leads: number;
    avgCpl: string; forms: string; next: string; updated: string;
  } | null;
  audit: {
    area: string; status: string; package: string; payment: string; campaignActive: string; cpl: string;
    funnelLive: string; whatsappOk: string; sentiment: string; leads30d: number; bookedAllTime: number;
    healthScore: number; notes: string;
  } | null;
  adAccountInfo: Record<string, string> | null;
  ads: ClientAd[];
  adTotals: { spend: number; results: number; cpl: number | null; active: number; count: number; bestAd: string | null } | null;
  onboarding: { q: string; a: string }[];
  onboardingExtra: { q: string; a: string }[] | null;
  calls: ClientCall[];
  feedback: ClientFeedback[];
  septTracker: { forms: number; calls: number } | null;
  docs: { title: string; url: string }[];
  oldDashboard: {
    name: string; title: string | null; companyName: string | null; location: string | null; subdomain: string | null;
    joined: string | null; lastSeen: string | null; firstLead: string | null; lastLead: string | null; leadsTotal: number;
    byStatus: Record<string, number>; byType: Record<string, number>;
    funnels: { name: string; type: string; published: boolean; created: string }[];
    fbForms: { form_id: string; label: string; lead_type: string; enabled: string }[];
    targetAreas: string[]; hidden: boolean; disabled: boolean; disabledAt: string | null;
    csmBoard: { stage: string; area: string; liveSince: string; checkinDue: string; reviewDue: string; stats: Record<string, unknown> }[] | null;
  } | null;
  sources: string[];
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
  status: ClientDossier["status"] | null;
  health: string | null;
  nextAction: string | null;
}

const PROFILE_COLS =
  "agent_id, display_name, whatsapp_number, email, area, company, avatar_url, sidebar_logo_url, sidebar_color, fb_page_id, fb_ad_account_id, is_operator, onboarded, automations_paused, tier";

/** Everything the grid needs, in three small reads. Only the few dossier
 *  fields shown on a card are fetched here; the detail page loads the rest. */
export async function listClients(): Promise<ClientCardRow[]> {
  const [profiles, live, dossiers] = await Promise.all([
    supabase.from("agent_profiles").select(PROFILE_COLS).eq("is_operator", false).order("display_name"),
    supabase.rpc("client_directory"),
    supabase.from("client_dossiers").select("agent_id, status:data->status, health:data->>health, nextAction:data->>nextAction"),
  ]);
  if (profiles.error) throw new Error(profiles.error.message);
  const liveBy = new Map(((live.data ?? []) as ClientLive[]).map((r) => [r.agent_id, r]));
  const dossierBy = new Map(
    ((dossiers.data ?? []) as { agent_id: string; status: ClientDossier["status"] | null; health: string | null; nextAction: string | null }[]).map((r) => [r.agent_id, r]),
  );
  return (profiles.data as ClientProfile[]).map((p) => {
    const d = dossierBy.get(p.agent_id);
    return { ...p, live: liveBy.get(p.agent_id) ?? null, status: d?.status ?? null, health: d?.health ?? null, nextAction: d?.nextAction ?? null };
  });
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
