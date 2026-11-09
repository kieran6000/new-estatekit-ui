import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Box, IconButton, Tooltip } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { listAgentProfiles } from "../api/_client";
import { useAuth } from "../hooks/useAuth";
import { clientPath, CLIENT_TABS, type ClientTab } from "../lib/clientSlug";
import { prefetchClient } from "../lib/prefetchClient";
import { tokens } from "../theme";

// ‹ › next to a client's name: step to the previous or next account, on the
// same tab, in the same order as the account switcher. The arrow keys work
// too. The accounts either side are loaded in the background, so stepping
// is instant.

export default function ClientArrows({ agentId }: { agentId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { tab: tabParam } = useParams();
  const [params] = useSearchParams();
  const { data: profiles = [] } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles, staleTime: 5 * 60_000 });
  const list = profiles.filter((p) => p.agent_id !== user?.id && (!p.deactivated_at || p.agent_id === agentId));
  const at = list.findIndex((p) => p.agent_id === agentId);
  const prev = at >= 0 && list.length > 1 ? list[(at - 1 + list.length) % list.length] : null;
  const next = at >= 0 && list.length > 1 ? list[(at + 1) % list.length] : null;
  const tab: ClientTab = CLIENT_TABS.includes(tabParam as ClientTab) ? (tabParam as ClientTab) : "overview";
  const dates = new URLSearchParams([...params].filter(([k]) => k === "range" || k === "from" || k === "to")).toString();
  const name = (p: { display_name: string | null; whatsapp_number: string | null }) => p.display_name || p.whatsapp_number || "Unnamed";

  const go = (to: string) => navigate(`${clientPath(to, profiles, tab)}${tab === "overview" && dates ? `?${dates}` : ""}`);

  // A head start on the neighbours, once this page has had a moment to load.
  useEffect(() => {
    if (!prev || !next) return;
    const t = setTimeout(() => { void prefetchClient(qc, next.agent_id); void prefetchClient(qc, prev.agent_id); }, 1200);
    return () => clearTimeout(t);
  }, [qc, prev?.agent_id, next?.agent_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ← and → step through accounts, unless you're typing or a box is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest("[role=dialog],[role=menu],[role=listbox],[role=tablist],[role=slider]"))) return;
      const to = e.key === "ArrowLeft" ? prev : next;
      if (to) { e.preventDefault(); go(to.agent_id); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!prev || !next) return null;
  const btn = { width: 36, height: 36, border: `1px solid ${tokens.divider}`, bgcolor: "background.paper" };
  return (
    <Box sx={{ display: "flex", gap: 0.5, flex: "none" }}>
      <Tooltip title={`${name(prev)} (← key)`}>
        <IconButton aria-label={`Previous account: ${name(prev)}`} onClick={() => go(prev.agent_id)} onMouseEnter={() => void prefetchClient(qc, prev.agent_id)} sx={btn}><ChevronLeftIcon /></IconButton>
      </Tooltip>
      <Tooltip title={`${name(next)} (→ key)`}>
        <IconButton aria-label={`Next account: ${name(next)}`} onClick={() => go(next.agent_id)} onMouseEnter={() => void prefetchClient(qc, next.agent_id)} sx={btn}><ChevronRightIcon /></IconButton>
      </Tooltip>
    </Box>
  );
}
