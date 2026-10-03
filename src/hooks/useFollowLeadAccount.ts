import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getActiveAgentIdSync, listAgentProfiles, setActiveAgent } from "../api/_client";
import { useAuth } from "./useAuth";
import { useIsOperator } from "./useAutomations";
import { useSnack } from "./useSnack";

/**
 * Staff opening a lead from another client's account (a WhatsApp lead link, a
 * link in Discord or on the automations screen) are switched into that
 * client's account, so "View all my leads" and the lead page show that
 * client's leads instead of "Lead not found" in whoever they were managing.
 * Agents are never switched: they only ever see their own leads.
 */
export function useFollowLeadAccount(lead: { agent_id: string } | null | undefined) {
  const { user } = useAuth();
  const { data: isOperator } = useIsOperator();
  const qc = useQueryClient();
  const showSnack = useSnack();
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!user || isOperator !== true || !lead?.agent_id) return;
    const current = getActiveAgentIdSync() ?? user.id;
    if (lead.agent_id === current || done.current === lead.agent_id) return;
    done.current = lead.agent_id;
    setActiveAgent(lead.agent_id === user.id ? null : lead.agent_id);
    void qc.invalidateQueries();
    const to = lead.agent_id;
    qc.fetchQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles, staleTime: 5 * 60_000 })
      .then((profiles) => profiles.find((p) => p.agent_id === to)?.display_name)
      .catch(() => null)
      .then((name) => showSnack(name ? `Switched to ${name}'s account` : "Switched to this lead's account"));
  }, [user, isOperator, lead?.agent_id, qc, showSnack]);
}
