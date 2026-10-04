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
  useFollowAccount(lead, "lead");
}

/** The same for anything that belongs to one account (a workflow, a link
 *  with ?account=): staff are switched into the account it belongs to. */
export function useFollowAccount(item: { agent_id: string } | null | undefined, what: "lead" | "workflow" | "account") {
  const { user } = useAuth();
  const { data: isOperator } = useIsOperator();
  const qc = useQueryClient();
  const showSnack = useSnack();
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!user || isOperator !== true || !item?.agent_id) return;
    const current = getActiveAgentIdSync() ?? user.id;
    if (item.agent_id === current || done.current === item.agent_id) return;
    done.current = item.agent_id;
    setActiveAgent(item.agent_id === user.id ? null : item.agent_id);
    void qc.invalidateQueries();
    const to = item.agent_id;
    qc.fetchQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles, staleTime: 5 * 60_000 })
      .then((profiles) => profiles.find((p) => p.agent_id === to)?.display_name)
      .catch(() => null)
      .then((name) => showSnack(name ? `Switched to ${name}'s account` : what === "account" ? "Switched account" : `Switched to this ${what}'s account`));
  }, [user, isOperator, item?.agent_id, qc, showSnack, what]);
}
