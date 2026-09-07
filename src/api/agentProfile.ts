import { supabase, getCurrentUserId, getActiveAgentId } from "./_client";

export interface FbAdAccount {
  currency: string;
  balance: number | null;
  amountSpent: number | null;
  spendCap: number | null;
  name: string | null;
  accountStatus: number | null;
  /** Present when Meta could not be read (e.g. missing ads_read permission). */
  note?: string;
}

export async function getFbAdAccount(adAccountId: string): Promise<FbAdAccount> {
  const { data, error } = await supabase.functions.invoke("fb-ad-account", { body: { adAccountId } });
  if (error) throw new Error(data?.error || error.message);
  if (data?.error) throw new Error(data.error);
  return data as FbAdAccount;
}

/** Operator-only. Passwords are hashed and can never be read back — this sets
 *  a new one for the given agent. */
export async function setAgentPassword(agentId: string, newPassword: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("admin-set-password", {
    body: { agentId, newPassword },
  });
  if (error) throw new Error(data?.error || error.message);
  if (data?.error) throw new Error(data.error);
}

export interface ActiveAd {
  id: string;
  name: string;
  status: string;
  adSetName: string;
  pageName: string;
  pageAvatar: string;
  postUrl: string;
  body: string;
  headline: string;
  imageUrl: string;
  cta: string;
  link: string;
}

/** The ads currently delivering on an ad account, with creative fields for preview. */
export async function getActiveAds(adAccountId: string): Promise<ActiveAd[]> {
  const { data, error } = await supabase.functions.invoke("fb-active-ads", { body: { adAccountId } });
  if (error) throw new Error(data?.error || error.message);
  if (data?.error) throw new Error(data.error);
  return (data?.ads ?? []) as ActiveAd[];
}

/** Daily ad spend keyed by YYYY-MM-DD, from Meta insights. */
export async function getFbAdInsights(adAccountId: string, since: string | null): Promise<Record<string, number>> {
  const { data, error } = await supabase.functions.invoke("fb-ad-insights", { body: { adAccountId, since } });
  if (error) throw new Error(data?.error || error.message);
  if (data?.error) throw new Error(data.error);
  return (data?.daily ?? {}) as Record<string, number>;
}

export interface AgentProfile {
  agentId: string;
  displayName: string;
  email: string;
  whatsappNumber: string;
  area: string;
  company: string;
  contractPdfUrl: string | null;
  renewalDate: string | null;
  tier: string;
  adspendBalance: number;
  billingType: "card" | "prepaid";
  fbAdAccountId: string;
  fbPageId: string | null;
  sidebarColor: string;
  sidebarLogoUrl: string | null;
  onboarded: boolean;
}

interface ProfileRow {
  agent_id: string;
  display_name: string;
  email: string;
  whatsapp_number: string;
  area: string;
  company: string;
  contract_pdf_url: string | null;
  renewal_date: string | null;
  tier: string;
  adspend_balance: number;
  billing_type: "card" | "prepaid";
  fb_ad_account_id: string;
  fb_page_id: string | null;
  sidebar_color: string;
  sidebar_logo_url: string | null;
  onboarded: boolean;
}

function rowToProfile(r: ProfileRow): AgentProfile {
  return {
    agentId: r.agent_id,
    displayName: r.display_name,
    email: r.email,
    whatsappNumber: r.whatsapp_number,
    area: r.area,
    company: r.company,
    contractPdfUrl: r.contract_pdf_url,
    renewalDate: r.renewal_date,
    tier: r.tier,
    adspendBalance: r.adspend_balance,
    billingType: r.billing_type,
    fbAdAccountId: r.fb_ad_account_id,
    fbPageId: r.fb_page_id,
    sidebarColor: r.sidebar_color || "#111827",
    sidebarLogoUrl: r.sidebar_logo_url,
    onboarded: r.onboarded,
  };
}

export async function getMyProfile(): Promise<AgentProfile | null> {
  const userId = await getActiveAgentId();
  const { data, error } = await supabase
    .from("agent_profiles")
    .select("*")
    .eq("agent_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToProfile(data as ProfileRow) : null;
}

/** Whether the *logged-in* user (not the active/managed agent) has finished
 *  onboarding. Defaults to true on any error so no one gets trapped. */
export async function amIOnboarded(): Promise<boolean> {
  const uid = await getCurrentUserId();
  const { data, error } = await supabase
    .from("agent_profiles")
    .select("onboarded")
    .eq("agent_id", uid)
    .maybeSingle();
  if (error) return true;
  return data?.onboarded ?? true;
}

export async function upsertProfile(
  patch: Partial<Omit<AgentProfile, "agentId" | "tier">>,
): Promise<void> {
  const userId = await getCurrentUserId();
  const row: Record<string, unknown> = { agent_id: userId };
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.whatsappNumber !== undefined) row.whatsapp_number = patch.whatsappNumber;
  if (patch.area !== undefined) row.area = patch.area;
  if (patch.company !== undefined) row.company = patch.company;
  if (patch.contractPdfUrl !== undefined) row.contract_pdf_url = patch.contractPdfUrl;
  if (patch.renewalDate !== undefined) row.renewal_date = patch.renewalDate;
  if (patch.sidebarColor !== undefined) row.sidebar_color = patch.sidebarColor;
  if (patch.sidebarLogoUrl !== undefined) row.sidebar_logo_url = patch.sidebarLogoUrl;
  if (patch.fbPageId !== undefined) row.fb_page_id = patch.fbPageId;
  if (patch.fbAdAccountId !== undefined) row.fb_ad_account_id = patch.fbAdAccountId;
  if (patch.onboarded !== undefined) row.onboarded = patch.onboarded;

  const { error } = await supabase
    .from("agent_profiles")
    .upsert(row, { onConflict: "agent_id" });
  if (error) throw new Error(error.message);
}
