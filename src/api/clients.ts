import { supabase } from "./_client";
import { uploadImage } from "../lib/image";

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
  /** Email each new lead a confirmation in the agent's name. Off by default. */
  lead_confirmation_email: boolean;
  tier: string;
  renewal_date: string | null;
  contract_pdf_url: string | null;
}

export interface ClientCardRow extends ClientProfile {
  live: ClientLive | null;
  /** Recent sales on record (for the Get set up progress). */
  sales_count: number;
}

const PROFILE_COLS =
  "agent_id, display_name, whatsapp_number, email, area, company, avatar_url, sidebar_logo_url, sidebar_color, fb_page_id, fb_ad_account_id, is_operator, onboarded, automations_paused, lead_confirmation_email, tier, renewal_date, contract_pdf_url";

/** Everything the grid needs, in two small reads. */
export async function listClients(): Promise<ClientCardRow[]> {
  const [profiles, live, sold] = await Promise.all([
    supabase.from("agent_profiles").select(PROFILE_COLS).eq("is_operator", false).order("display_name"),
    supabase.rpc("client_directory"),
    supabase.from("sold_listings").select("agent_id"),
  ]);
  if (profiles.error) throw new Error(profiles.error.message);
  const liveBy = new Map(((live.data ?? []) as ClientLive[]).map((r) => [r.agent_id, r]));
  const salesBy = new Map<string, number>();
  for (const r of (sold.data ?? []) as { agent_id: string }[]) salesBy.set(r.agent_id, (salesBy.get(r.agent_id) ?? 0) + 1);
  return (profiles.data as ClientProfile[]).map((p) => ({ ...p, live: liveBy.get(p.agent_id) ?? null, sales_count: salesBy.get(p.agent_id) ?? 0 }));
}

/** Daily ad spend from `since` ("YYYY-MM-DD") to today, from Meta:
 *  { "2026-09-01": 123.45, … }. null when Meta couldn't be read. */
export async function getSpendDaily(adAccountId: string, since: string): Promise<Record<string, number> | null> {
  const { data, error } = await supabase.functions.invoke("fb-ad-insights", { body: { adAccountId, since } });
  if (error || data?.error || data?.note) return null;
  return (data?.daily ?? {}) as Record<string, number>;
}

/** Spend on the days from `since` up to (not including) `until`, both "YYYY-MM-DD". */
export function spendBetween(daily: Record<string, number> | null | undefined, since: string, until: string): number | null {
  if (!daily) return null;
  return Object.entries(daily).reduce((a, [d, v]) => (d >= since && d < until ? a + (Number(v) || 0) : a), 0);
}

/** Leads per account in [since, until), for the Accounts list (operators only). */
export async function getLeadCounts(since: Date, until: Date): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc("operator_lead_counts", { p_since: since.toISOString(), p_until: until.toISOString() });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { agent_id: string; leads: number }[]).map((r) => [r.agent_id, Number(r.leads)]));
}

export interface AgentResults {
  leads: number;
  followed_up: number;
  booked: number;
  mandates: number;
  waiting: number;
  no_answer: number;
}

/** One account's results in [since, until); waiting and no_answer are "now". */
export async function getResultsBetween(agentId: string, since: Date, until: Date): Promise<AgentResults | null> {
  const { data, error } = await supabase.rpc("get_agent_results_between", {
    p_agent: agentId,
    p_since: since.toISOString(),
    p_until: until.toISOString(),
  });
  if (error) throw new Error(error.message);
  return (data as AgentResults) ?? null;
}

/** A real payment problem, not just spend building up until the next charge:
 *  Facebook says the bill is unpaid, pending or in its grace period, or it
 *  disabled the account over payment; or the amount due is more than about a
 *  week of this account's normal spend (min R500), meaning a charge didn't go
 *  through. Only used to colour the icon; the reason isn't shown. */
export function hasPaymentProblem(
  a: { accountStatus?: number | null; disableReason?: number | null; balance?: number | null } | null | undefined,
  avgDailySpend: number | null | undefined,
): boolean {
  if (!a) return false;
  if (a.accountStatus === 3 || a.accountStatus === 8 || a.accountStatus === 9) return true;
  if (a.accountStatus === 2 && a.disableReason === 3) return true;
  const due = a.balance ?? 0;
  return due > Math.max(500, (avgDailySpend ?? 0) * 7);
}

/** Their Ads Manager, opened on this ad account. */
export const adsManagerUrl = (adAccountId: string) =>
  `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountId.replace(/^act_/, "")}`;

/** How the ad account pays, from Meta's funding source type: a card, or
 *  money added up front ("prepaid"). Meta's codes: 1 = card, 20 = stored
 *  balance (prepaid), 12/13 = PayPal, 17 = direct debit. */
export function fundingKind(type: string | null | undefined): "Card" | "Prepaid" | "PayPal" | "Debit order" | "Other" | null {
  if (type == null || type === "") return null;
  switch (String(type)) {
    case "1": return "Card";
    case "20": return "Prepaid";
    case "12":
    case "13": return "PayPal";
    case "17": return "Debit order";
    default: return "Other";
  }
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

export type ClientProfilePatch = Partial<
  Pick<ClientProfile, "display_name" | "whatsapp_number" | "email" | "area" | "company" | "avatar_url" | "fb_page_id" | "fb_ad_account_id" | "automations_paused" | "lead_confirmation_email" | "renewal_date" | "contract_pdf_url" | "tier">
>;

/** Operator edit of a client's account row. Throws if nothing was saved
 *  (RLS silently matches zero rows for a non-operator). */
export async function updateClientProfile(agentId: string, patch: ClientProfilePatch): Promise<void> {
  const { data, error } = await supabase.from("agent_profiles").update(patch).eq("agent_id", agentId).select("agent_id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("not_saved");
}

/** Saves a client's stored record. `changes` is merged over what's already
 *  there, so fields this app doesn't show are kept. */
export async function saveClientDossier(agentId: string, current: ClientDossier | null, changes: Partial<ClientDossier>): Promise<void> {
  const data = { ...(current ?? {}), ...changes };
  const { error } = await supabase
    .from("client_dossiers")
    .upsert({ agent_id: agentId, data, updated_at: new Date().toISOString() }, { onConflict: "agent_id" });
  if (error) throw new Error(error.message);
}

/** Uploads a client photo to the same bucket the Account page uses. */
export async function uploadClientPhoto(uploaderId: string, file: File): Promise<string> {
  return uploadImage(file, "photo", uploaderId);
}

/** The picture for a client: their photo, then their Facebook page picture,
 *  then their brand logo. */
export function clientPicture(p: Pick<ClientProfile, "avatar_url" | "fb_page_id" | "sidebar_logo_url">): string | undefined {
  if (p.avatar_url) return p.avatar_url;
  if (p.fb_page_id) return `https://graph.facebook.com/${p.fb_page_id}/picture?type=square&width=160&height=160`;
  return p.sidebar_logo_url || undefined;
}
