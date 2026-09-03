import { supabase } from "./_client";

export interface MockUser {
  id: string;
  phone: string;
}

export const DEV_BYPASS_PHONE = "+10000000000";
export const DEV_BYPASS_CODE = "0000";

export async function requestCode(phone: string): Promise<{ error?: string }> {
  if (phone === DEV_BYPASS_PHONE) return {};
  const { error } = await supabase.functions.invoke("request-whatsapp-otp", {
    body: { phone },
  });
  if (error) return { error: error.message };
  return {};
}

export async function verifyCode(
  phone: string,
  code: string,
): Promise<{ error?: string; user?: MockUser }> {
  const { data, error } = await supabase.functions.invoke(
    "verify-whatsapp-otp",
    { body: { phone, code } },
  );
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };

  const { access_token, refresh_token, user } = data;
  if (!access_token || !refresh_token || !user) {
    return { error: "Invalid response from server" };
  }

  await supabase.auth.setSession({ access_token, refresh_token });
  return { user: { id: user.id, phone: user.phone || phone } };
}

export async function getSession(): Promise<MockUser | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  return { id: session.user.id, phone: session.user.phone || "" };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
