import { supabase, getCurrentUserId } from "./_client";

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
  };
}

export async function getMyProfile(): Promise<AgentProfile | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("agent_profiles")
    .select("*")
    .eq("agent_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToProfile(data as ProfileRow) : null;
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

  const { error } = await supabase
    .from("agent_profiles")
    .upsert(row, { onConflict: "agent_id" });
  if (error) throw new Error(error.message);
}
