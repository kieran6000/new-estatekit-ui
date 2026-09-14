import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePostHog } from "@posthog/react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, restoreActiveAgent, clearActiveAgentFor, forgetActiveAgentInMemory } from "../api/_client";
import * as authApi from "../api/auth";
import * as tierApi from "../api/tier";
import { trackActivity, registerActivityPostHog } from "../lib/activity";
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
  const qc = useQueryClient();
  // Who the session belonged to on the previous auth event — see the handler.
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (posthog) registerActivityPostHog(posthog as unknown as { get_session_id?: () => string; get_distinct_id?: () => string });
  }, [posthog]);

  useEffect(() => {
    authApi.getSession().then((session) => {
      if (session) {
        restoreActiveAgent(session.id);
        lastUserIdRef.current = session.id;
      }
      setUser(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const nextId = session?.user?.id ?? null;
        // Whoever the session belonged to a moment ago. Tracked in a ref rather
        // than read from state so the comparison doesn't depend on when React
        // happens to flush a render.
        const prevId = lastUserIdRef.current;
        lastUserIdRef.current = nextId;

        // The session changed hands — expired then someone else signed in on
        // this tab, or it ended entirely. Either way, everything remembered
        // about the previous person has to go before the next render: the
        // in-memory "managing <client>" flag, and every cached per-agent row.
        // Skipped when prevId is null (a logged-out visitor at startup), where
        // there's nothing to drop and a public /l/ or /p/ page may be fetching.
        if (prevId && prevId !== nextId) {
          forgetActiveAgentInMemory();
          qc.clear();
        }

        setUser(session?.user ? { id: session.user.id, phone: session.user.phone || "" } : null);
      },
    );
    return () => subscription.unsubscribe();
  }, [qc]);

  async function signIn(phone: string, password: string): Promise<{ error?: string }> {
    const { error, user: signedInUser } = await authApi.signIn(phone, password);
    if (error) return { error };
    // Start this person from a clean slate: drop whoever the last session was
    // managing, throw away their cached rows, then restore only this user's own
    // remembered choice. Without the reset, signing in after someone else on
    // the same browser inherited their "managing <client>" state.
    forgetActiveAgentInMemory();
    qc.clear();
    if (signedInUser) restoreActiveAgent(signedInUser.id);
    lastUserIdRef.current = signedInUser?.id ?? null;
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
    if (user) clearActiveAgentFor(user.id);
    forgetActiveAgentInMemory();
    lastUserIdRef.current = null;
    await authApi.signOut();
    setUser(null);
    // Leads, pipelines and profiles are all per-agent — leaving them cached
    // would show the next person to sign in on this device the previous
    // agent's rows until each query happened to refetch.
    qc.clear();
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
