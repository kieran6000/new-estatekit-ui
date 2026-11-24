import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
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

  // ← and → step through accounts from anywhere on the page — even when a
  // button, tab or card has focus — UNLESS you're typing in a field or working
  // an open menu/dialog/slider (there the arrows mean something else). Capture
  // phase + stopPropagation so we win over e.g. the tab strip's own arrow keys.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest("[role=menu],[role=listbox],[role=dialog],[role=slider]"))) return;
      const to = e.key === "ArrowLeft" ? prev : next;
      if (to) { e.preventDefault(); e.stopPropagation(); go(to.agent_id); }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!prev || !next) return null;
  const btn = { width: 36, height: 36, border: `1px solid ${tokens.divider}`, bgcolor: "background.paper" };
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flex: "none" }}>
      <Box sx={{ display: "flex", gap: 0.5 }}>
        <Tooltip title={`${name(prev)} (← key)`}>
          <IconButton aria-label={`Previous account: ${name(prev)}`} onClick={() => go(prev.agent_id)} onMouseEnter={() => void prefetchClient(qc, prev.agent_id)} sx={btn}><ChevronLeftIcon /></IconButton>
        </Tooltip>
        <Tooltip title={`${name(next)} (→ key)`}>
          <IconButton aria-label={`Next account: ${name(next)}`} onClick={() => go(next.agent_id)} onMouseEnter={() => void prefetchClient(qc, next.agent_id)} sx={btn}><ChevronRightIcon /></IconButton>
        </Tooltip>
      </Box>
      {/* Says, quietly, that the keyboard arrows do this too. Desktop only. */}
      <Tooltip title="Use the ← and → keys to move between accounts">
        <Box aria-hidden sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", gap: 0.5, userSelect: "none" }}>
          <Box component="span" sx={keycapSx}>←</Box>
          <Box component="span" sx={keycapSx}>→</Box>
          <Typography component="span" sx={{ fontSize: 11.5, color: tokens.ink3, ml: 0.25 }}>to switch</Typography>
        </Box>
      </Tooltip>
    </Box>
  );
}

// A little keyboard-key look: raised cap, bottom shadow.
const keycapSx = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minWidth: 20, height: 20, px: 0.5, borderRadius: "5px", fontSize: 13, lineHeight: 1,
  color: tokens.ink2, bgcolor: "background.paper",
  border: `1px solid ${tokens.divider}`, borderBottomWidth: 2,
} as const;
