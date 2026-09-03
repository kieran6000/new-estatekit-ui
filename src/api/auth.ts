import { supabase } from "./_client";

export interface MockUser {
  id: string;
  phone: string;
}

function phoneToEmail(phone: string): string {
  return phone.replace(/\+/g, "") + "@estatekit.app";
}

export async function signIn(
  phone: string,
  password: string,
): Promise<{ error?: string; user?: MockUser }> {
  const email = phoneToEmail(phone);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { error: error.message };
  if (!data.user) return { error: "Sign-in failed" };
  return { user: { id: data.user.id, phone: data.user.phone || phone } };
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
