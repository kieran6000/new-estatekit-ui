import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePostHog } from "@posthog/react";
import * as authApi from "../api/auth";
import * as tierApi from "../api/tier";
import type { MockUser } from "../api/auth";

// Frontend-only mock auth — no backend, no keys. Accepts the fixed dev
// phone/code (see src/api/auth.ts) and persists a fake session in
// localStorage. authMode is kept as a field (always "dev_bypass") so
// LoginPage's copy/prefill logic needs no changes.
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
  }, []);

  async function requestCode(phone: string): Promise<{ error?: string }> {
    return authApi.requestCode(phone);
  }

  async function verifyCode(phone: string, code: string): Promise<{ error?: string }> {
    const { error, user: signedInUser } = await authApi.verifyCode(phone, code);
    if (error) return { error };
    setUser(signedInUser ?? null);
    if (signedInUser) {
      const tier = await tierApi.getTier();
      posthog.identify(signedInUser.id, { phone: signedInUser.phone, tier });
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
