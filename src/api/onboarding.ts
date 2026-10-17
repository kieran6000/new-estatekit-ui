import { supabase } from "./_client";

// The /onboarding form (new clients, after the call) and its "what happens
// next" page. See supabase/functions/submit-onboarding and
// supabase/migrations/20261017_0004_onboarding.sql.

export interface OnboardingAnswers {
  name: string;
  email: string;
  phone: string;
  agency: string;
  website: string;
  address: string;
  campaign: string;
  city: string;
  suburbs: string[];
  price: string;
  deals: string;
  offer: string;
  /** Shrunk pictures as data URLs (or "" for none). */
  headshot: string;
  logo: string;
}

/** Saves the answers and creates their account (login sent by WhatsApp and
 *  email). Returns the private code for their "what happens next" page. */
export async function submitOnboarding(a: OnboardingAnswers): Promise<{ token: string; account: "created" | "existing" | "failed" }> {
  const { data, error } = await supabase.functions.invoke("submit-onboarding", { body: a });
  if (error || !data?.token) throw new Error(data?.error || error?.message || "not saved");
  return data;
}

/** "I've watched the video". */
export async function markOnboardingWatched(token: string): Promise<void> {
  await supabase.rpc("onboarding_watched", { p_token: token });
}

export const ONBOARDING_VIDEO_KEY = "onboarding_video_url";

/** The "what happens next" video (anyone can read it). */
export async function getOnboardingVideo(): Promise<string> {
  const { data } = await supabase.rpc("get_public_setting", { p_key: ONBOARDING_VIDEO_KEY });
  return typeof data === "string" ? data : "";
}

/** Staff only (RLS). */
export async function setOnboardingVideo(url: string): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert({ key: ONBOARDING_VIDEO_KEY, value: url || null, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export interface OnboardingSubmission {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  agency: string;
  campaign: string;
  city: string | null;
  suburbs: string[];
  agent_id: string | null;
  account_status: string | null;
  login_sent: string | null;
  video_watched_at: string | null;
}

/** Staff only (RLS): the latest submissions. */
export async function listOnboardingSubmissions(): Promise<OnboardingSubmission[]> {
  const { data, error } = await supabase
    .from("onboarding_submissions")
    .select("id, created_at, name, phone, agency, campaign, city, suburbs, agent_id, account_status, login_sent, video_watched_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as OnboardingSubmission[];
}
