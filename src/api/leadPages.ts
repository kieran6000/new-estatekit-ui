import { supabase, getActiveAgentId } from "./_client";
import type { FormAnswer, LeadPage, PipelineKind } from "../types";

interface LeadPageRow {
  id: string;
  slug: string;
  pipeline_id: string;
  agent_name: string;
  name: string;
  headline: string;
  suburb: string;
  phone: string;
  logo_data_url: string | null;
  profile_photo_data_url: string | null;
  accent_color: string;
  show_intro: boolean;
  name_label: string;
  phone_label: string;
  cta_label: string;
  thank_you_headline: string;
  thank_you_subtext: string;
  fb_pixel_id: string;
  source_type: string;
  fb_form_id: string | null;
  fb_form_name: string | null;
}

function rowToPage(r: LeadPageRow): LeadPage {
  return {
    id: r.id,
    slug: r.slug,
    pipelineId: r.pipeline_id,
    agentName: r.agent_name,
    name: r.name,
    headline: r.headline,
    suburb: r.suburb,
    phone: r.phone,
    logoDataUrl: r.logo_data_url,
    profilePhotoDataUrl: r.profile_photo_data_url,
    accentColor: r.accent_color,
    showIntro: r.show_intro,
    nameLabel: r.name_label,
    phoneLabel: r.phone_label,
    ctaLabel: r.cta_label,
    thankYouHeadline: r.thank_you_headline,
    thankYouSubtext: r.thank_you_subtext,
    fbPixelId: r.fb_pixel_id,
    sourceType: (r.source_type as "website" | "fb_form") || "website",
    fbFormId: r.fb_form_id,
    fbFormName: r.fb_form_name,
  };
}

function patchToRow(
  p: Partial<Omit<LeadPage, "id" | "pipelineId">>,
): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (p.slug !== undefined) m.slug = p.slug;
  if (p.agentName !== undefined) m.agent_name = p.agentName;
  if (p.name !== undefined) m.name = p.name;
  if (p.headline !== undefined) m.headline = p.headline;
  if (p.suburb !== undefined) m.suburb = p.suburb;
  if (p.phone !== undefined) m.phone = p.phone;
  if (p.logoDataUrl !== undefined) m.logo_data_url = p.logoDataUrl;
  if (p.profilePhotoDataUrl !== undefined)
    m.profile_photo_data_url = p.profilePhotoDataUrl;
  if (p.accentColor !== undefined) m.accent_color = p.accentColor;
  if (p.showIntro !== undefined) m.show_intro = p.showIntro;
  if (p.nameLabel !== undefined) m.name_label = p.nameLabel;
  if (p.phoneLabel !== undefined) m.phone_label = p.phoneLabel;
  if (p.ctaLabel !== undefined) m.cta_label = p.ctaLabel;
  if (p.thankYouHeadline !== undefined)
    m.thank_you_headline = p.thankYouHeadline;
  if (p.thankYouSubtext !== undefined)
    m.thank_you_subtext = p.thankYouSubtext;
  if (p.fbPixelId !== undefined) m.fb_pixel_id = p.fbPixelId;
  if (p.sourceType !== undefined) m.source_type = p.sourceType;
  if (p.fbFormId !== undefined) m.fb_form_id = p.fbFormId;
  if (p.fbFormName !== undefined) m.fb_form_name = p.fbFormName;
  return m;
}

export async function listLeadPages(): Promise<LeadPage[]> {
  const agentId = await getActiveAgentId();
  const { data, error } = await supabase
    .from("lead_pages")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as LeadPageRow[]).map(rowToPage);
}

export async function getLeadPageBySlug(slug: string): Promise<LeadPage | null> {
  const { data, error } = await supabase
    .from("lead_pages")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToPage(data as LeadPageRow) : null;
}

export async function getLeadPagePublic(pageId: string): Promise<LeadPage | null> {
  const { data, error } = await supabase
    .from("lead_pages")
    .select("*")
    .eq("id", pageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToPage(data as LeadPageRow) : null;
}

export async function addLeadPage(
  name: string,
  pipelineId: string,
  _kind: PipelineKind,
  opts?: { sourceType?: "website" | "fb_form"; fbFormId?: string; fbFormName?: string },
): Promise<LeadPage> {
  const agentId = await getActiveAgentId();
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "page";
  const row: Record<string, unknown> = { agent_id: agentId, pipeline_id: pipelineId, name, slug };
  if (opts?.sourceType) row.source_type = opts.sourceType;
  if (opts?.fbFormId) row.fb_form_id = opts.fbFormId;
  if (opts?.fbFormName) row.fb_form_name = opts.fbFormName;
  const { data, error } = await supabase
    .from("lead_pages")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToPage(data as LeadPageRow);
}

export interface FbForm {
  id: string;
  name: string;
  status: string;
}

export interface FbFormQuestion {
  key: string;
  label: string;
  type: string;
  options?: { key: string; value: string }[];
  id?: string;
}

export interface FbFormDetail {
  id: string;
  name: string;
  locale?: string;
  questions: FbFormQuestion[];
  context_card?: {
    title?: string;
    content?: string[];
    button_text?: string;
    cover_photo?: string;
  };
  thank_you_page?: {
    title?: string;
    body?: string;
    button_text?: string;
    button_type?: string;
    website_url?: string;
    business_phone_number?: string;
  };
  legal_content?: {
    privacy_policy?: { url: string; link_text: string };
    custom_disclaimer?: unknown;
  };
}

export async function getFbForm(fbPageId: string | null, formId: string): Promise<FbFormDetail> {
  const { data, error } = await supabase.functions.invoke("get-fb-form", {
    body: { pageId: fbPageId, formId },
  });
  if (error) {
    console.error("get-fb-form error:", error, "data:", data);
    throw new Error(data?.error || error.message);
  }
  if (data?.error) {
    console.error("get-fb-form API error:", data.error);
    throw new Error(data.error);
  }
  return data.form as FbFormDetail;
}

export async function listFbForms(fbPageId: string): Promise<FbForm[]> {
  const { data, error } = await supabase.functions.invoke("list-fb-forms", {
    body: { pageId: fbPageId },
  });
  if (error) {
    console.error("list-fb-forms error:", error, "data:", data);
    throw new Error(data?.error || error.message);
  }
  if (data?.error) {
    console.error("list-fb-forms API error:", data.error);
    throw new Error(data.error);
  }
  return data?.forms || [];
}

export async function updateLeadPage(
  id: string,
  patch: Partial<Omit<LeadPage, "id" | "pipelineId">>,
): Promise<void> {
  const row = patchToRow(patch);
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase
    .from("lead_pages")
    .update(row)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteLeadPage(id: string): Promise<void> {
  const { error } = await supabase.from("lead_pages").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function submitMockLead(
  pageId: string,
  name: string,
  phone: string,
  formAnswers: FormAnswer[],
  email: string | null = null,
) {
  const { data, error } = await supabase.functions.invoke(
    "public-submit-lead",
    { body: { pageId, name, phone, formAnswers, email } },
  );
  if (error) throw new Error(error.message);
  return data;
}
