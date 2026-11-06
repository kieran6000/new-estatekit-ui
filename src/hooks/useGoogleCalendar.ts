import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getActiveAgentIdSync } from "../api/_client";
import { connectGoogleCalendar, getGoogleCalendarStatus, listGoogleEvents } from "../api/googleCalendar";
import { useAuth } from "./useAuth";
import { useSnack } from "./useSnack";

export const GCAL_STATUS_KEY = "googleCalendarStatus";
export const GCAL_EVENTS_KEY = "googleEvents";

/** Whose calendar the screen is about: the signed-in agent's own, or (an
 *  operator switched into an account) that agent's. A Google account belongs
 *  to a person, so only the signed-in person can connect or read their own. */
export function useCalendarOwner(): { agentId: string | undefined; managingOther: boolean } {
  const { user } = useAuth();
  const active = getActiveAgentIdSync();
  const managingOther = !!active && !!user && active !== user.id;
  return { agentId: managingOther ? active! : user?.id, managingOther };
}

export function statusQuery(agentId: string | undefined, managingOther: boolean) {
  return {
    queryKey: [GCAL_STATUS_KEY, agentId],
    queryFn: () => getGoogleCalendarStatus(managingOther ? agentId : undefined),
    staleTime: 60_000,
  };
}

/** The Google Calendar connection for the account on screen. While changes
 *  are going in, it checks again every few seconds so "Updating…" settles. */
export function useGoogleCalendarStatus() {
  const { agentId, managingOther } = useCalendarOwner();
  const q = useQuery({
    ...statusQuery(agentId, managingOther),
    enabled: !!agentId,
    refetchInterval: (query) => ((query.state.data?.pending ?? 0) > 0 ? 5_000 : false),
  });
  return { status: q.data ?? null, isLoading: q.isLoading, managingOther };
}

/** Connect (or reconnect): off to Google's page, back to returnTo. */
export function useConnectGoogleCalendar(returnTo: string) {
  const showSnack = useSnack();
  const [busy, setBusy] = useState(false);
  async function connect() {
    setBusy(true);
    try {
      await connectGoogleCalendar(returnTo);
      // The page is leaving for Google; stay busy until it does.
    } catch (e) {
      console.error(e);
      showSnack((e as Error).message === "not_configured" ? "Google Calendar isn't switched on yet. EstateKit is setting it up." : "Couldn't open Google. Try again.");
      setBusy(false);
    }
  }
  return { connect, busy };
}

const RETURN_WORDS: Record<string, string> = {
  connected: "Google Calendar connected. Your appointments, call times and follow-ups go in by themselves.",
  cancelled: "Google Calendar wasn't connected.",
  noscope: "Google Calendar wasn't connected: tick the calendar box on Google's page.",
  error: "Couldn't connect Google Calendar. Try again.",
};

/** Back from Google's page (?calendar=connected …): say how it went, once. */
export function useGoogleCalendarReturn() {
  const [params, setParams] = useSearchParams();
  const showSnack = useSnack();
  const qc = useQueryClient();
  const result = params.get("calendar");
  useEffect(() => {
    if (!result) return;
    showSnack(RETURN_WORDS[result] ?? RETURN_WORDS.error);
    void qc.invalidateQueries({ queryKey: [GCAL_STATUS_KEY] });
    void qc.invalidateQueries({ queryKey: [GCAL_EVENTS_KEY] });
    void qc.invalidateQueries({ queryKey: ["myProfile"] });
    setParams((p) => { const n = new URLSearchParams(p); n.delete("calendar"); return n; }, { replace: true });
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The signed-in person's own Google events from..to (the Calendar tab).
 *  Off while an operator is switched into someone else's account. */
export function useGoogleEvents(from: Date, to: Date, enabled: boolean) {
  return useQuery({
    queryKey: [GCAL_EVENTS_KEY, from.toISOString(), to.toISOString()],
    queryFn: () => listGoogleEvents(from, to),
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
}
