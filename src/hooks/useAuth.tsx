import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePostHog } from "@posthog/react";
import { supabase } from "../api/_client";
import * as authApi from "../api/auth";
import * as tierApi from "../api/tier";
import type { MockUser } from "../api/auth";

export const DEV_BYPASS_PHONE = authApi.DEV_BYPASS_PHONE;
export const DEV_BYPASS_CODE = authApi.DEV_BYPASS_CODE;

interface AuthContextValue {
  user: MockUser | null;
  loading: boolean;
  authMode: "dev_bypass";
  requestCode: (phone: string) => Promise<{ error?: string }>;
  verifyCode: (phone: string, code: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(null);
  const [loading, setLoading] = useState(true);
  const posthog = usePostHog();

  useEffect(() => {
    authApi.getSession().then((session) => {
      setUser(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setUser({ id: session.user.id, phone: session.user.phone || "" });
        } else {
          setUser(null);
        }
      },
    );
    return () => subscription.unsubscribe();
  }, []);

  async function requestCode(phone: string): Promise<{ error?: string }> {
    return authApi.requestCode(phone);
  }

  async function verifyCode(phone: string, code: string): Promise<{ error?: string }> {
    const { error, user: signedInUser } = await authApi.verifyCode(phone, code);
    if (error) return { error };
    setUser(signedInUser ?? null);
    if (signedInUser) {
      try {
        const tier = await tierApi.getTier();
        posthog.identify(signedInUser.id, { phone: signedInUser.phone, tier });
      } catch {
        posthog.identify(signedInUser.id, { phone: signedInUser.phone });
      }
    }
    return {};
  }

  async function signOut() {
    await authApi.signOut();
    setUser(null);
    posthog.reset();
  }

  return (
    <AuthContext.Provider value={{ user, loading, authMode: "dev_bypass", requestCode, verifyCode, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
