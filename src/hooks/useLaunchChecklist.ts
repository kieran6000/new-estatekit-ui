import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMyProfile } from "../api/agentProfile";
import { getActiveAgentIdSync } from "../api/_client";
import { useLeads } from "./useLeads";
import { hasSeenLeadsTour, TOUR_SEEN_EVENT } from "../lib/tour";

// The Launch checklist, worked out from the account's real data so nothing is
// ever ticked by hand. Shared by the Launch page (the list) and the sidebar
// (which hides the Launch tab once everything is done).

export type LaunchKey = "signed_up" | "tour" | "photo" | "logo" | "facebook" | "first_lead" | "first_call";

export interface LaunchItem {
  key: LaunchKey;
  label: string;
  hint: string;
  done: boolean;
  /** Where the button goes (in-app path, often with ?focus= to spotlight the field). */
  to?: string;
  /** Or: a pre-filled WhatsApp to the admin, for things only we can do. */
  whatsapp?: string;
  cta?: string;
  /** Rough minutes it takes, for the "about N minutes left" line. */
  minutes: number;
}

export function useLaunchChecklist() {
  const { data: profile, isLoading: profileLoading } = useQuery({ queryKey: ["myProfile"], queryFn: getMyProfile, staleTime: 5 * 60_000 });
  const { data: leads = [], isLoading: leadsLoading } = useLeads();

  // The tour flag lives in localStorage; the tour announces when it ends.
  const [tourSeen, setTourSeen] = useState(() => hasSeenLeadsTour(getActiveAgentIdSync()));
  useEffect(() => {
    const sync = () => setTourSeen(hasSeenLeadsTour(getActiveAgentIdSync()));
    sync();
    window.addEventListener(TOUR_SEEN_EVENT, sync);
    return () => window.removeEventListener(TOUR_SEEN_EVENT, sync);
  }, [profile?.agentId]);

  const firstNew = leads.find((l) => !l.archived && l.stage === "New Lead");

  const items: LaunchItem[] = [
    { key: "signed_up", label: "Create your account", hint: "Done. Welcome aboard.", done: true, minutes: 0 },
    { key: "tour", label: "Take the 30-second tour", hint: "The 4 things you'll use every day.", done: tourSeen, to: "/leads?tour=1", cta: "Start tour", minutes: 1 },
    { key: "photo", label: "Add your photo", hint: "Sellers trust a face. It shows after they fill in your form.", done: !!profile?.avatarUrl, to: "/account?focus=photo", cta: "Add photo", minutes: 1 },
    { key: "logo", label: "Add your agency logo", hint: "It brands your lead page and your dashboard.", done: !!profile?.sidebarLogoUrl, to: "/account?focus=logo", cta: "Add logo", minutes: 1 },
    {
      key: "facebook",
      label: "Connect your Facebook page",
      hint: "So your ads run from your page and leads flow in here. We'll do it with you.",
      done: !!profile?.fbPageId,
      whatsapp: `Hi, it's ${profile?.displayName || "me"}. Please help me connect my Facebook page to EstateKit.`,
      cta: "Ask us",
      minutes: 5,
    },
    {
      key: "first_lead",
      label: "Get your first lead",
      hint: "Arrives once your ads are live. Share your lead page link to get one sooner.",
      done: leads.length > 0,
      to: "/lead-page?focus=share",
      cta: "Share my page",
      minutes: 1,
    },
    {
      key: "first_call",
      label: "Call your first lead",
      hint: "The fastest caller usually wins the listing.",
      done: leads.some((l) => l.stage !== "New Lead"),
      to: firstNew ? `/leads/${firstNew.id}?focus=call` : undefined,
      cta: firstNew ? "Call now" : undefined,
      minutes: 2,
    },
  ];

  const done = items.filter((i) => i.done).length;
  const total = items.length;
  return {
    ready: !profileLoading && !leadsLoading && !!profile,
    profile,
    items,
    done,
    total,
    complete: done === total,
    next: items.find((i) => !i.done) ?? null,
    minutesLeft: items.filter((i) => !i.done).reduce((a, i) => a + i.minutes, 0),
  };
}
