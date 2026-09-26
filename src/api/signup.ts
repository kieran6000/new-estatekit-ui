import { supabase } from "./_client";

// Free-account requests from the public /start page. Anyone can submit
// (through request_signup, which validates); only operators can read them.
// See supabase/migrations/20260926_0001_signup_requests.sql.

export type SignupStatus = "new" | "contacted" | "signed_up" | "not_a_fit";

export interface SignupRequest {
  id: string;
  created_at: string;
  name: string;
  whatsapp: string;
  agency: string;
  wants: string[];
  suburbs: string;
  budget: string;
  ref: string | null;
  source: string | null;
  status: SignupStatus;
}

export async function requestSignup(r: {
  name: string;
  whatsapp: string;
  agency: string;
  wants: string[];
  suburbs: string;
  budget: string;
  ref: string | null;
  source: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("request_signup", {
    p_name: r.name,
    p_whatsapp: r.whatsapp,
    p_agency: r.agency,
    p_wants: r.wants,
    p_suburbs: r.suburbs,
    p_budget: r.budget,
    p_ref: r.ref,
    p_source: r.source,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listSignupRequests(): Promise<SignupRequest[]> {
  const { data, error } = await supabase
    .from("signup_requests")
    .select("id, created_at, name, whatsapp, agency, wants, suburbs, budget, ref, source, status")
    .in("status", ["new", "contacted"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as SignupRequest[];
}

export async function setSignupStatus(id: string, status: SignupStatus, operatorId: string): Promise<void> {
  const { error } = await supabase
    .from("signup_requests")
    .update({ status, handled_at: new Date().toISOString(), handled_by: operatorId })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
