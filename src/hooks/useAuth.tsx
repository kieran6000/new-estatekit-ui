import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePostHog } from "@posthog/react";
import { supabase } from "../api/_client";
import * as authApi from "../api/auth";
import * as tierApi from "../api/tier";
import { trackActivity } from "../lib/activity";
import type { MockUser } from "../api/auth";

interface AuthContextValue {
  user: MockUser | null;
  loading: boolean;
  signIn: (phone: string, password: string) => Promise<{ error?: string }>;
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

  async function signIn(phone: string, password: string): Promise<{ error?: string }> {
    const { error, user: signedInUser } = await authApi.signIn(phone, password);
    if (error) return { error };
    setUser(signedInUser ?? null);
    if (signedInUser) {
      try {
        const tier = await tierApi.getTier();
        posthog.identify(signedInUser.id, { phone: signedInUser.phone, tier });
      } catch {
        posthog.identify(signedInUser.id, { phone: signedInUser.phone });
      }
      // PostHog needs a beat to establish the session id before we log in.
      setTimeout(() => trackActivity("login", { agentId: signedInUser.id }), 400);
    }
    return {};
  }

  async function signOut() {
    await authApi.signOut();
    setUser(null);
    posthog.reset();
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
