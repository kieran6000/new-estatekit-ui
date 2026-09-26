import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  CircularProgress,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Checkbox,
  FormControlLabel,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CallIcon from "@mui/icons-material/Call";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/EditOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import PhoneCallbackIcon from "@mui/icons-material/PhoneCallback";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { tokens } from "../theme";
import { DEAD_STAGES, PIPELINE_KIND_LABEL, PIPELINE_STAGES, type LeadRow, type OutcomeStep, type Pipeline, type PipelineKind, type Stage } from "../types";
import { stageLabel } from "../types";
import { dueLeads, pipelineKindFor, sortLeadsForList, stepForStage, computeStagePatch, stageForKind } from "../lib/stageLogic";
import { timeAgo } from "../lib/timeAgo";
import { useLeads, useUpdateLeadStage } from "../hooks/useLeads";
import { useAddPipeline, usePipelines, useSyncPipelineSheet } from "../hooks/usePipelines";
import { renamePipeline } from "../api/pipelines";
import { useIsOperator } from "../hooks/useAutomations";
import { useSnack } from "../hooks/useSnack";
import { maskPhone } from "../lib/format";
import { useCanSeeFullPhone } from "../hooks/useTier";
import { getPendingCall, clearPendingCall, type PendingCall } from "../lib/pendingCall";
import { bulkUpdateLeads, searchLeadsEverywhere, type LeadSearchHit } from "../api/leads";
import { logLeadCall } from "../api/leadEvents";
import { startLeadsTour, hasSeenLeadsTour } from "../lib/tour";
import { listArchivedLeads } from "../api/leads";
import { syncFbLeads } from "../api/leadPages";
import { getActiveAgentIdSync } from "../api/_client";
import { getMyProfile } from "../api/agentProfile";
import GSheetIcon from "../components/GSheetIcon";
import StageMenu from "../components/StageMenu";
import OutcomeSheet from "../components/OutcomeSheet";
import FocusCallModal from "../components/FocusCallModal";

export default function LeadsPage() {
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width:639px)");
  const { data: leads = [], isLoading: leadsLoading } = useLeads();
  const { data: pipelines = [], isLoading: pipelinesLoading } = usePipelines();
  const updateStage = useUpdateLeadStage();
  const syncSheet = useSyncPipelineSheet();
  const showSnack = useSnack();
  const qc = useQueryClient();
  const { data: isOperator } = useIsOperator();
  const posthog = usePostHog();
  const { data: myProfile } = useQuery({ queryKey: ["myProfile"], queryFn: getMyProfile, staleTime: 5 * 60_000 });
  function runTour(auto: boolean) {
    startLeadsTour({
      agentId: getActiveAgentIdSync(),
      firstName: myProfile?.displayName,
      capture: (event, props) => posthog.capture(event, props),
      auto,
    });
  }
  // Operators can look at what's been archived without it cluttering the list.
  const [showArchived, setShowArchived] = useState(false);
  const { data: archivedLeads = [] } = useQuery({
    queryKey: ["archivedLeads"],
    queryFn: listArchivedLeads,
    enabled: showArchived,
  });

  const pipelineStorageKey = `estatekit_last_pipeline_${getActiveAgentIdSync() || "me"}`;

  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  // Operator-only: widen the search from this pipeline to every account.
  const [searchAll, setSearchAll] = useState(false);
  const showGlobalSearch = searchOpen && searchAll && !!isOperator && q.trim().length >= 2;
  const [pipelineId, setPipelineId] = useState<string | null>(() => {
    try { return localStorage.getItem(pipelineStorageKey); } catch { return null; }
  });
  const [reloading, setReloading] = useState(false);
  const [pipelineMenuAnchor, setPipelineMenuAnchor] = useState<HTMLElement | null>(null);
  const [addPipelineOpen, setAddPipelineOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [filter, setFilter] = useState<"All" | Stage>("All");
  const [outcomeLeadId, setOutcomeLeadId] = useState<string | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [stageSheet, setStageSheet] = useState<{ leadId: string; step: OutcomeStep; stage: Stage } | null>(null);

  // Operator bulk actions: select many leads, then move / restage / archive.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Anchor row for shift+click range selection (last row toggled on its own).
  const [selectAnchor, setSelectAnchor] = useState<string | null>(null);
  const [bulkMoveAnchor, setBulkMoveAnchor] = useState<HTMLElement | null>(null);
  const [bulkStageAnchor, setBulkStageAnchor] = useState<HTMLElement | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
    setSelectAnchor(null);
    setBulkMoveAnchor(null);
    setBulkStageAnchor(null);
  }

  // A call started elsewhere (dialer/WhatsApp) whose outcome was never logged —
  // surfaced as a one-tap "log it now" row so nothing slips through.
  const [pending, setPending] = useState<PendingCall | null>(() => getPendingCall());
  useEffect(() => {
    const refresh = () => setPending(getPendingCall());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const pendingLead = pending ? leads.find((l) => l.id === pending.leadId) : undefined;

  // First visit with leads on screen: offer the walkthrough once. Waits for
  // the list to render so the tour has something to point at. Never
  // auto-starts for operators (they switch between accounts all day); they
  // can still run it from the ? button.
  useEffect(() => {
    const agentId = getActiveAgentIdSync();
    if (leadsLoading || pipelinesLoading || isOperator !== false || hasSeenLeadsTour(agentId)) return;
    const t = setTimeout(() => runTour(true), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadsLoading, pipelinesLoading, isOperator]);
  function dismissPending() {
    clearPendingCall();
    setPending(null);
  }

  // Default to the pipeline holding the most recent lead, so the agent lands
  // where the newest action is — unless they've explicitly picked one before
  // (that choice is remembered in localStorage and always wins).
  const pipelineOfLatestLead = useMemo(() => {
    let latest: LeadRow | undefined;
    for (const l of leads) if (!latest || l.created_at > latest.created_at) latest = l;
    return latest ? pipelines.find((p) => p.id === latest!.pipeline_id) : undefined;
  }, [leads, pipelines]);

  const activePipeline: Pipeline | undefined =
    pipelines.find((p) => p.id === pipelineId) ??
    pipelineOfLatestLead ??
    pipelines.find((p) => p.kind === "seller") ??
    pipelines[0];
  const stagesForPipeline = activePipeline ? PIPELINE_STAGES[activePipeline.kind] : [];

  // Restore this pipeline's remembered stage filter when it becomes active
  // (initial load / switch). Falls back to "All" if the saved stage isn't
  // valid for this pipeline.
  useEffect(() => {
    if (!activePipeline) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(`estatekit_pipeline_filter_${activePipeline.id}`); } catch { /* ignore */ }
    const valid = saved && (saved === "All" || PIPELINE_STAGES[activePipeline.kind].includes(saved as Stage));
    setFilter(valid ? (saved as "All" | Stage) : "All");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePipeline?.id]);

  const pipelineLeads = useMemo(() => {
    const source = showArchived ? archivedLeads : leads;
    return activePipeline ? source.filter((l) => l.pipeline_id === activePipeline.id) : [];
  }, [leads, archivedLeads, showArchived, activePipeline]);


  // Who's actually due a call right now, ignoring the stage filter — the
  // banner shouldn't vanish just because the agent narrowed the list.
  const callList = useMemo(() => dueLeads(pipelineLeads), [pipelineLeads]);

  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim();
    return sortLeadsForList(pipelineLeads).filter((l) => {
      if (filter !== "All" && l.stage !== filter) return false;
      if (!query) return true;
      return l.name.toLowerCase().includes(query) || l.phone.replace(/\s/g, "").includes(query.replace(/\s/g, ""));
    });
  }, [pipelineLeads, filter, q]);

  // Flat visual order of the rows currently on screen — drives shift+click
  // range selection (grouped view lays rows out stage-by-stage).
  const orderedVisibleIds = useMemo(() => {
    if (filter === "All") {
      return stagesForPipeline.flatMap((st) => filtered.filter((l) => l.stage === st).map((l) => l.id));
    }
    return filtered.map((l) => l.id);
  }, [filtered, filter, stagesForPipeline]);

  function handleRowSelect(id: string, shiftKey: boolean) {
    if (shiftKey && selectAnchor && orderedVisibleIds.includes(selectAnchor) && orderedVisibleIds.includes(id)) {
      const a = orderedVisibleIds.indexOf(selectAnchor);
      const b = orderedVisibleIds.indexOf(id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(orderedVisibleIds[i]);
        return next;
      });
    } else {
      toggleSelect(id);
    }
    setSelectAnchor(id);
  }

  const outcomeLead = leads.find((l) => l.id === outcomeLeadId);
  const stageSheetLead = leads.find((l) => l.id === stageSheet?.leadId);
  const outcomeLeadKind = outcomeLead ? pipelineKindFor(outcomeLead, pipelines) : "seller";
  const stageSheetLeadKind = stageSheetLead ? pipelineKindFor(stageSheetLead, pipelines) : "seller";

  function handleStagePick(id: string, stage: Stage) {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    const step = stepForStage(stage, activePipeline?.kind ?? "seller");
    if (step) {
      setStageSheet({ leadId: id, step, stage });
      return;
    }
    const prev = { stage: lead.stage, next_label: lead.next_label, due: lead.due, reminder_at: lead.reminder_at, commission: lead.commission };
    updateStage.mutate({ id, stage });
    showSnack(`${lead.name.split(" ")[0]} moved to ${stage}`, () =>
      updateStage.mutate({ id, stage: prev.stage, override: prev }),
    );
  }

  function filterKey(pid: string) {
    return `estatekit_pipeline_filter_${pid}`;
  }

  function selectPipeline(id: string) {
    setPipelineId(id);
    try { localStorage.setItem(pipelineStorageKey, id); } catch { /* private browsing */ }
    setPipelineMenuAnchor(null);
    // the effect on activePipeline.id restores this pipeline's saved filter
  }

  function pickFilter(s: "All" | Stage) {
    setFilter(s);
    if (activePipeline) {
      try { localStorage.setItem(filterKey(activePipeline.id), s); } catch { /* private browsing */ }
    }
  }

  async function reloadLeads() {
    setReloading(true);
    try {
      await syncFbLeads({ agentId: getActiveAgentIdSync() || undefined });
      await qc.invalidateQueries({ queryKey: ["leads"] });
    } catch {
      // still refetch what's in the DB even if the FB pull failed
      await qc.invalidateQueries({ queryKey: ["leads"] });
    } finally {
      setReloading(false);
    }
  }

  async function runBulk(fn: () => Promise<void>, done: string) {
    setBulkBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["leads"] });
      await qc.invalidateQueries({ queryKey: ["archivedLeads"] });
      showSnack(done);
      exitSelect();
    } catch (e) {
      console.error(e);
      showSnack("Couldn't update those leads. Try again.");
    } finally {
      setBulkBusy(false);
    }
  }
  const selectedIds = () => [...selected];
  function bulkArchive() {
    const ids = selectedIds();
    runBulk(() => bulkUpdateLeads(ids, { archived: !showArchived }), `${ids.length} ${showArchived ? "restored" : "archived"}`);
  }
  function bulkSetStage(stage: Stage) {
    setBulkStageAnchor(null);
    const ids = selectedIds();
    runBulk(() => bulkUpdateLeads(ids, { stage, ...computeStagePatch(stage) }), `${ids.length} moved to ${stage}`);
  }
  function bulkMovePipeline(target: Pipeline) {
    setBulkMoveAnchor(null);
    const chosen = leads.filter((l) => selected.has(l.id));
    // Group by the stage each lead maps to in the target kind, so no lead lands
    // on a stage the destination pipeline doesn't have.
    const groups = new Map<Stage, string[]>();
    for (const l of chosen) {
      const st = stageForKind(l.stage as Stage, target.kind);
      const arr = groups.get(st) ?? [];
      arr.push(l.id);
      groups.set(st, arr);
    }
    runBulk(async () => {
      for (const [st, ids] of groups) {
        await bulkUpdateLeads(ids, { pipeline_id: target.id, stage: st, ...computeStagePatch(st) });
      }
    }, `${chosen.length} moved to ${target.name}`);
  }

  if (leadsLoading || pipelinesLoading) return <LeadsPageSkeleton />;
  if (!activePipeline) return null;

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important", px: "8px 8px 8px 16px" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500, flex: 1 }}>Leads</Typography>
          <IconButton onClick={() => runTour(false)} title="How it works" aria-label="How it works">
            <HelpOutlineIcon />
          </IconButton>
          <IconButton onClick={() => setSearchOpen((v) => !v)}>
            <SearchIcon />
          </IconButton>
          <Avatar sx={{ width: 32, height: 32, bgcolor: tokens.primary, fontSize: 14, ml: 0.5 }}>K</Avatar>
        </Toolbar>
      </AppBar>

      {pendingLead && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, p: "12px 12px 12px 16px", bgcolor: tokens.amberTint, borderBottom: `1px solid ${tokens.divider}` }}>
          <PhoneCallbackIcon sx={{ color: "#e65100" }} />
          <Box sx={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setOutcomeLeadId(pendingLead.id)}>
            <Typography sx={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>
              How did your call with {pendingLead.name.split(" ")[0]} go?
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
              Called {timeAgo(new Date(pending!.startedAt).toISOString())} · tap to update
            </Typography>
          </Box>
          <Button size="small" variant="contained" onClick={() => setOutcomeLeadId(pendingLead.id)} sx={{ whiteSpace: "nowrap" }}>
            Log it
          </Button>
          <IconButton size="small" onClick={dismissPending} aria-label="Dismiss">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {searchOpen && (
        <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, p: "10px 16px" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
            <SearchIcon sx={{ color: "text.disabled" }} />
            <InputBase
              placeholder={searchAll ? "Search every account by name, phone or email" : "Search leads"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              fullWidth
              autoFocus
            />
            {q && (
              <IconButton size="small" onClick={() => setQ("")} aria-label="Clear search">
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
          {/* Operators support every client, so "which account was that lead on
              again?" is a daily question. Agents never see this — for them the
              same query would only ever return their own leads anyway. */}
          {isOperator && (
            <FormControlLabel
              control={<Checkbox size="small" checked={searchAll} onChange={(e) => setSearchAll(e.target.checked)} />}
              label="Search across all accounts"
              sx={{ mt: 0.5, ml: -0.75, "& .MuiFormControlLabel-label": { fontSize: 13, color: "text.secondary" } }}
            />
          )}
        </Box>
      )}

      {/* Whole-database results replace the pipeline list while active, so
          there's no confusion about which set of leads is on screen. */}
      {showGlobalSearch && (
        <GlobalSearchResults
          query={q}
          onOpen={(hit) => navigate(`/leads/${hit.id}`)}
        />
      )}



      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 1, gap: 1, p: "8px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Box
          component="button"
          onClick={(e) => setPipelineMenuAnchor(e.currentTarget)}
          data-tour="pipeline"
          sx={{ display: "flex", alignItems: "center", gap: 0.25, border: `1px solid ${tokens.divider}`, borderRadius: "4px", bgcolor: tokens.surface, fontSize: 13, fontWeight: 500, p: "7px 6px 7px 12px", cursor: "pointer" }}
        >
          {activePipeline.name} pipeline <ArrowDropDownIcon fontSize="small" />
        </Box>
        <IconButton
          onClick={() => setRenameOpen(true)}
          title="Rename pipeline"
          aria-label="Rename pipeline"
          size="small"
          sx={{ color: "text.secondary" }}
        >
          <EditIcon sx={{ fontSize: 18 }} />
        </IconButton>
        <PipelineMenu
          anchor={pipelineMenuAnchor}
          pipelines={pipelines}
          onClose={() => setPipelineMenuAnchor(null)}
          onSelect={selectPipeline}
          onAddNew={() => {
            setPipelineMenuAnchor(null);
            setAddPipelineOpen(true);
          }}
        />
        <Box sx={{ flex: 1, minWidth: { xs: "100%", sm: 0 } }} />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
        {isOperator && (
          <Button
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            variant={selectMode ? "contained" : "outlined"}
            size="small"
            sx={{ whiteSpace: "nowrap", textTransform: "none", ...(selectMode ? {} : { color: "text.primary", borderColor: tokens.divider }) }}
          >
            {selectMode ? "Done" : "Select"}
          </Button>
        )}

        <IconButton
          onClick={reloadLeads}
          data-tour="refresh"
          disabled={reloading}
          title="Reload leads"
          sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "4px", width: 34, height: 34 }}
        >
          <RefreshIcon sx={{ fontSize: 18, color: "text.secondary", animation: reloading ? "spin 0.8s linear infinite" : "none", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />
        </IconButton>

        {/* Labelled so it's obvious what it does, rather than a bare icon. */}
        <Button
          data-tour="sheets"
          onClick={() => {
            if (activePipeline.sheet_url) {
              window.open(activePipeline.sheet_url, "_blank");
              return;
            }
            syncSheet.mutate(activePipeline.id, {
              onSuccess: (url) => { showSnack("Spreadsheet created"); window.open(url, "_blank"); },
              onError: (err) => showSnack(err.message.includes("service account") ? "Google Sheets not configured — contact admin" : "Failed to create spreadsheet"),
            });
          }}
          disabled={syncSheet.isPending}
          variant="outlined"
          size="small"
          startIcon={syncSheet.isPending ? <CircularProgress size={14} /> : <GSheetIcon size={16} />}
          sx={{ whiteSpace: "nowrap", textTransform: "none", color: "text.primary", borderColor: tokens.divider }}
        >
          {syncSheet.isPending
            ? "Creating…"
            : activePipeline.sheet_url ? (isMobile ? "Sheets" : "Open in Sheets") : (isMobile ? "Export" : "Export to Sheets")}
        </Button>
        </Box>
      </Box>

      <Box sx={{ p: "10px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", mb: 0.75 }}>
          Filter by stage
        </Typography>
        <Box data-tour="filters" sx={{ display: "flex", gap: 0.75, overflowX: "auto" }}>
          {isOperator && (
            <Box
              component="button"
              onClick={() => setShowArchived((v) => !v)}
              sx={{
                display: "flex", alignItems: "center", gap: 0.5,
                border: `1px solid ${showArchived ? "#92400e" : tokens.divider}`,
                borderRadius: "6px",
                bgcolor: showArchived ? "#fef3c7" : "#fff",
                color: showArchived ? "#92400e" : "text.secondary",
                fontWeight: showArchived ? 600 : 400,
                fontSize: 12.5, p: "5px 10px", cursor: "pointer", whiteSpace: "nowrap",
                "&:hover": { borderColor: "#92400e" },
              }}
            >
              {showArchived ? "Viewing archived" : "Archived"}
            </Box>
          )}
          {(["All", ...stagesForPipeline] as const).map((s) => {
            const active = filter === s;
            const count = s === "All" ? pipelineLeads.length : pipelineLeads.filter((l) => l.stage === s).length;
            return (
              <Box
                key={s}
                component="button"
                onClick={() => pickFilter(s)}
                sx={{
                  display: "flex", alignItems: "center", gap: 0.5,
                  border: `1px solid ${active ? tokens.primary : tokens.divider}`,
                  borderRadius: "6px",
                  bgcolor: active ? tokens.primaryBg : "#fff",
                  color: active ? tokens.primaryDark : "text.secondary",
                  fontWeight: active ? 600 : 400,
                  fontSize: 12.5,
                  p: "5px 10px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  "&:hover": { borderColor: tokens.primary, color: tokens.primaryDark },
                }}
              >
                {s === "Mandate Signed" ? "Mandate" : s}
                <Box component="span" sx={{ fontSize: 11, color: active ? tokens.primary : "text.disabled", fontWeight: 600 }}>
                  {count}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* One-at-a-time call mode. Shown only when there's actually something to
          call, so the list isn't cluttered on a quiet day. This is the whole
          "don't make me think" path: tap once, work the list top to bottom. */}
      {!selectMode && !showArchived && !showGlobalSearch && callList.length > 0 && (
        <Box
          sx={{
            display: "flex", alignItems: "center", gap: 1.5,
            p: "12px 16px", bgcolor: "background.paper",
            borderBottom: `1px solid ${tokens.divider}`,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
              {callList.length} {callList.length === 1 ? "lead" : "leads"} to call
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
              Go through them one at a time
            </Typography>
          </Box>
          <Button
            onClick={() => setFocusOpen(true)}
            variant="contained"
            startIcon={<CallIcon />}
            sx={{ bgcolor: tokens.green, whiteSpace: "nowrap", "&:hover": { bgcolor: tokens.greenDark } }}
          >
            Start calling
          </Button>
        </Box>
      )}

      {!showGlobalSearch && (
      <LeadsTable
        leads={filtered}
        stages={stagesForPipeline}
        kind={activePipeline.kind}
        filter={filter}
        selectable={selectMode}
        selected={selected}
        onToggleSelect={toggleSelect}
        onRowSelect={handleRowSelect}
        onOpen={(id) => navigate(`/leads/${id}`)}
        onCall={(id) => {
          setOutcomeLeadId(id);
          const called = leads.find((l) => l.id === id);
          if (called) logLeadCall(called.id, called.agent_id);
        }}
        onStagePick={handleStagePick}
      />
      )}

      {/* Bulk action bar — appears once leads are selected. Sits above the
          mobile bottom-nav (56px). Boring on purpose. */}
      {selectMode && selected.size > 0 && (
        <Paper
          elevation={8}
          sx={{
            position: "fixed", left: 0, right: 0, bottom: { xs: 56, sm: 0 }, zIndex: 20,
            borderTop: `1px solid ${tokens.divider}`,
            display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap",
            p: "8px 12px",
          }}
        >
          <Typography sx={{ fontSize: 14, fontWeight: 600, mr: 0.5 }}>{selected.size} selected</Typography>
          <Box sx={{ flex: 1 }} />
          <Button size="small" disabled={bulkBusy} onClick={(e) => setBulkStageAnchor(e.currentTarget)} endIcon={<ArrowDropDownIcon />} sx={{ textTransform: "none" }}>
            Stage
          </Button>
          <Button size="small" disabled={bulkBusy} onClick={(e) => setBulkMoveAnchor(e.currentTarget)} endIcon={<ArrowDropDownIcon />} sx={{ textTransform: "none" }}>
            Move to
          </Button>
          <Button size="small" color="inherit" disabled={bulkBusy} onClick={bulkArchive} sx={{ textTransform: "none", color: "text.secondary" }}>
            {showArchived ? "Restore" : "Archive"}
          </Button>
          <IconButton size="small" onClick={exitSelect} aria-label="Clear selection"><CloseIcon fontSize="small" /></IconButton>

          <Menu anchorEl={bulkStageAnchor} open={!!bulkStageAnchor} onClose={() => setBulkStageAnchor(null)}>
            {stagesForPipeline.map((s) => (
              <MenuItem key={s} onClick={() => bulkSetStage(s)}>{s}</MenuItem>
            ))}
          </Menu>
          <Menu anchorEl={bulkMoveAnchor} open={!!bulkMoveAnchor} onClose={() => setBulkMoveAnchor(null)}>
            {pipelines.filter((p) => p.id !== activePipeline.id).map((p) => (
              <MenuItem key={p.id} onClick={() => bulkMovePipeline(p)}>{p.name}</MenuItem>
            ))}
            {pipelines.filter((p) => p.id !== activePipeline.id).length === 0 && (
              <MenuItem disabled>No other pipelines</MenuItem>
            )}
          </Menu>
        </Paper>
      )}


      <OutcomeSheet
        lead={outcomeLead}
        pipelineKind={outcomeLeadKind}
        open={!!outcomeLeadId}
        onClose={() => setOutcomeLeadId(null)}
        onLogged={() => { if (pending && outcomeLead?.id === pending.leadId) dismissPending(); }}
        onSnack={showSnack}
      />
      <OutcomeSheet
        lead={stageSheetLead}
        pipelineKind={stageSheetLeadKind}
        open={!!stageSheet}
        entryStep={stageSheet?.step ?? "main"}
        entryStage={stageSheet?.stage}
        onClose={() => setStageSheet(null)}
        onSnack={showSnack}
      />
      <FocusCallModal leads={pipelineLeads} pipelines={pipelines} open={focusOpen} onClose={() => setFocusOpen(false)} onSnack={showSnack} />
      <RenamePipelineDialog
        open={renameOpen}
        currentName={activePipeline.name}
        onClose={() => setRenameOpen(false)}
        onSave={(name) => {
          renamePipeline(activePipeline.id, name)
            .then(() => {
              qc.invalidateQueries({ queryKey: ["pipelines"] });
              setRenameOpen(false);
              showSnack("Pipeline renamed");
            })
            .catch((err) => { console.error(err); showSnack("That didn't save. Try again."); });
        }}
      />
      <AddPipelineDialog
        open={addPipelineOpen}
        onClose={() => setAddPipelineOpen(false)}
        onCreated={(id) => {
          selectPipeline(id);
          showSnack("Pipeline created");
        }}
      />
    </Box>
  );
}

/**
 * Whole-database lead search for operators. Supporting many clients means
 * fielding "which account was that lead on?" constantly, and the per-pipeline
 * search can't answer it. Debounced so typing doesn't hammer the database.
 */
function GlobalSearchResults({ query, onOpen }: { query: string; onOpen: (hit: LeadSearchHit) => void }) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["globalLeadSearch", debounced],
    queryFn: () => searchLeadsEverywhere(debounced),
    enabled: debounced.trim().length >= 2,
    staleTime: 30_000,
  });

  if (isFetching && hits.length === 0) {
    return (
      <Box sx={{ bgcolor: "background.paper" }}>
        {[0, 1, 2].map((i) => (
          <Box key={i} sx={{ p: "12px 16px", borderBottom: `1px solid ${tokens.divider2}` }}>
            <Skeleton variant="text" animation="wave" width="45%" height={20} />
            <Skeleton variant="text" animation="wave" width="30%" height={16} />
          </Box>
        ))}
      </Box>
    );
  }

  if (hits.length === 0) {
    return (
      <Box sx={{ p: "40px 24px", textAlign: "center", color: "text.secondary", bgcolor: "background.paper" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 500, mb: 0.5 }}>No leads match "{query}"</Typography>
        <Typography sx={{ fontSize: 13.5 }}>Try part of a name, a phone number, or an email address.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: "background.paper" }}>
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", p: "10px 16px 6px" }}>
        {hits.length} {hits.length === 1 ? "result" : "results"} across all accounts
        {hits.length === 50 ? " (showing the newest 50)" : ""}
      </Typography>
      {hits.map((h) => (
        <Box
          key={h.id}
          onClick={() => onOpen(h)}
          sx={{
            p: "12px 16px", borderTop: `1px solid ${tokens.divider2}`, cursor: "pointer",
            "&:hover": { bgcolor: tokens.hover },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 500, color: tokens.primaryDark, minWidth: 0, wordBreak: "break-word" }}>
              {h.name}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Typography sx={{ fontSize: 12, color: "text.disabled", whiteSpace: "nowrap" }}>{timeAgo(h.created_at)}</Typography>
          </Box>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {h.phone}
            {h.email ? ` · ${h.email}` : ""}
          </Typography>
          {/* The account is the whole point of this view — make it the loudest
              secondary detail, not a footnote. */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", mt: 0.5 }}>
            <Box sx={{ fontSize: 11.5, fontWeight: 700, bgcolor: tokens.primaryBg, color: tokens.primaryDark, borderRadius: "4px", px: 0.75, py: 0.25 }}>
              {h.agent_name}
            </Box>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {[h.pipeline_name, h.stage].filter(Boolean).join(" · ")}
              {h.archived ? " · archived" : ""}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function LeadsPageSkeleton() {
  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important", px: "8px 8px 8px 16px" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500, flex: 1 }}>Leads</Typography>
        </Toolbar>
      </AppBar>
      {/* pipeline bar */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: "8px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Skeleton variant="rounded" animation="wave" width={150} height={34} sx={{ borderRadius: "6px" }} />
        <Box sx={{ flex: 1 }} />
        <Skeleton variant="rounded" animation="wave" width={34} height={34} sx={{ borderRadius: "6px" }} />
        <Skeleton variant="rounded" animation="wave" width={34} height={34} sx={{ borderRadius: "6px" }} />
      </Box>
      {/* filter chips */}
      <Box sx={{ display: "flex", gap: 0.75, p: "10px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        {[54, 78, 70, 64].map((w, i) => (
          <Skeleton key={i} variant="rounded" animation="wave" width={w} height={28} sx={{ borderRadius: "6px" }} />
        ))}
      </Box>
      {/* lead rows — shaped like the real list */}
      <Box sx={{ bgcolor: "background.paper" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1.5, p: "12px 16px", borderBottom: `1px solid ${tokens.divider2}` }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Skeleton variant="text" animation="wave" width={`${45 + (i % 3) * 12}%`} height={20} />
              <Skeleton variant="text" animation="wave" width={`${30 + (i % 2) * 10}%`} height={16} />
            </Box>
            <Skeleton variant="rounded" animation="wave" width={72} height={34} sx={{ borderRadius: "6px" }} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function EmptyLeadsState({ filter }: { filter: "All" | Stage }) {
  return (
    <Box sx={{ p: "48px 24px", textAlign: "center", color: "text.secondary" }}>
      <Typography sx={{ fontSize: 15, fontWeight: 500, mb: 0.5 }}>
        {filter === "All" ? "No leads yet in this pipeline" : `No leads in "${filter}"`}
      </Typography>
      <Typography sx={{ fontSize: 13.5 }}>
        {filter === "All" ? "New leads from your lead pages will show up here." : "Try a different stage, or switch back to All."}
      </Typography>
    </Box>
  );
}

function PipelineMenu({
  anchor,
  pipelines,
  onClose,
  onSelect,
  onAddNew,
}: {
  anchor: HTMLElement | null;
  pipelines: Pipeline[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onAddNew: () => void;
}) {
  return (
    <Menu anchorEl={anchor} open={!!anchor} onClose={onClose}>
      {pipelines.map((p) => (
        <MenuItem key={p.id} onClick={() => onSelect(p.id)}>
          {p.name}
        </MenuItem>
      ))}
      <MenuItem onClick={onAddNew} sx={{ color: tokens.primary, borderTop: `1px solid ${tokens.divider2}`, mt: 0.5 }}>
        + Add pipeline
      </MenuItem>
    </Menu>
  );
}

/** Dead simple: one field, Save. */
function RenamePipelineDialog({
  open, currentName, onClose, onSave,
}: {
  open: boolean;
  currentName: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(currentName);
  useEffect(() => { if (open) setName(currentName); }, [open, currentName]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: 18, fontWeight: 500 }}>Rename pipeline</DialogTitle>
      <DialogContent>
        <TextField
          label="Pipeline name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onSave(name.trim()); }}
          fullWidth
          autoFocus
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name.trim()} onClick={() => onSave(name.trim())}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AddPipelineDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [kind, setKind] = useState<PipelineKind>("seller");
  const [name, setName] = useState("");
  const addPipeline = useAddPipeline();
  const posthog = usePostHog();

  async function create() {
    const finalName = name.trim() || PIPELINE_KIND_LABEL[kind].replace("-style", "");
    const p = await addPipeline.mutateAsync({ name: finalName, kind });
    posthog.capture("pipeline_added", { preset: kind });
    setName("");
    onClose();
    onCreated(p.id);
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: 18, fontWeight: 500 }}>Add pipeline</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <RadioGroup value={kind} onChange={(e) => setKind(e.target.value as PipelineKind)}>
          <FormControlLabel value="seller" control={<Radio />} label="Seller-style (New Lead → Mandate Signed)" />
          <FormControlLabel value="buyer" control={<Radio />} label="Buyer-style (New Lead → Bought)" />
          {/* For anything that isn't buying or selling — recruitment, referrals,
              a new offer. Same machinery, neutral wording, no custom work. */}
          <FormControlLabel value="general" control={<Radio />} label="General (New Lead → Signed up)" />
        </RadioGroup>
        <TextField label="Pipeline name" placeholder={PIPELINE_KIND_LABEL[kind].replace("-style", "")} value={name} onChange={(e) => setName(e.target.value)} fullWidth autoFocus />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={create}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function LeadsTable({
  leads,
  stages,
  kind,
  filter,
  selectable,
  selected,
  onToggleSelect,
  onRowSelect,
  onOpen,
  onCall,
  onStagePick,
}: {
  leads: LeadRow[];
  stages: Stage[];
  /** Only affects wording — a "general" pipeline shows neutral stage names. */
  kind: PipelineKind;
  filter: "All" | Stage;
  selectable: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onRowSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
  onCall: (id: string) => void;
  onStagePick: (id: string, stage: Stage) => void;
}) {
  const isMobile = useMediaQuery("(max-width:639px)");
  const canSeeFullPhone = useCanSeeFullPhone();
  if (isMobile) {
    return <MobileLeadsList leads={leads} stages={stages} kind={kind} filter={filter} selectable={selectable} selected={selected} onToggleSelect={onToggleSelect} onRowSelect={onRowSelect} onOpen={onOpen} onCall={onCall} onStagePick={onStagePick} />;
  }

  if (leads.length === 0) {
    return <EmptyLeadsState filter={filter} />;
  }

  const grouped = filter === "All";

  const rows = (group: LeadRow[]) =>
    group.map((l) => (
      <TableRow
        key={l.id}
        hover
        selected={selectable && selected.has(l.id)}
        onClick={selectable ? (e) => onRowSelect(l.id, e.shiftKey) : undefined}
        sx={{
          ...(selectable ? { cursor: "pointer", userSelect: "none" } : undefined),
          ...(l.due && !DEAD_STAGES.includes(l.stage) ? { bgcolor: tokens.amberTint } : DEAD_STAGES.includes(l.stage) ? { color: tokens.ink3 } : undefined),
        }}
      >
        {selectable && (
          <TableCell padding="checkbox">
            <Checkbox size="small" checked={selected.has(l.id)} readOnly tabIndex={-1} sx={{ pointerEvents: "none" }} />
          </TableCell>
        )}
        <TableCell sx={{ py: 1 }}>
          <Box component="span" onClick={selectable ? undefined : () => onOpen(l.id)} sx={{ fontWeight: 500, fontSize: 15, color: tokens.primaryDark, cursor: selectable ? "inherit" : "pointer" }}>
            {l.name}
            {l.stage === "New Lead" && <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: tokens.green, ml: 0.75 }}>NEW</Box>}
          </Box>
          <Typography sx={{ color: "text.secondary", fontSize: 13, display: "block" }}>
            {canSeeFullPhone ? l.phone : maskPhone(l.phone)}
            <Box component="span" sx={{ color: "text.disabled", mx: 0.75 }}>·</Box>
            {timeAgo(l.created_at)}
          </Typography>
        </TableCell>
        <TableCell>
          <StageMenu current={l.stage} stages={stages} kind={kind} onPick={(s) => onStagePick(l.id, s)}>
            {(open) => (
              <Box
                component="button"
                onClick={(e) => { e.stopPropagation(); open(e); }}
                sx={{ border: 0, bgcolor: "transparent", fontSize: 14, color: "inherit", display: "inline-flex", alignItems: "center", gap: 0.75, cursor: "pointer", p: "6px 0" }}
              >
                {stageLabel(l.stage, kind)}
              </Box>
            )}
          </StageMenu>
        </TableCell>
        <TableCell>
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, fontSize: 13, color: l.reminder_at ? "#e65100" : "text.secondary" }}>
            {l.reminder_at && <AccessTimeIcon sx={{ fontSize: 14 }} />}
            {l.next_label}
          </Box>
        </TableCell>
        <TableCell align="right">
          {/* Hidden while selecting, matching the mobile list — otherwise a tap
              meant to tick the row starts a phone call instead. */}
          {!selectable && !DEAD_STAGES.includes(l.stage) && (
            <Box
              component="a"
              href={`tel:${l.phone.replace(/\s/g, "")}`}
              onClick={(e) => { e.stopPropagation(); setTimeout(() => onCall(l.id), 150); }}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
                bgcolor: tokens.green,
                color: "#fff",
                borderRadius: "4px",
                p: "8px 14px",
                fontWeight: 500,
                fontSize: 13,
                textTransform: "uppercase",
                textDecoration: "none",
                "&:hover": { bgcolor: tokens.greenDark },
              }}
            >
              <CallIcon fontSize="small" /> Call
            </Box>
          )}
        </TableCell>
      </TableRow>
    ));

  return (
    <Box sx={{ bgcolor: "background.paper", overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {selectable && (
              <TableCell padding="checkbox">
                <Checkbox
                  size="small"
                  indeterminate={selected.size > 0 && selected.size < leads.length}
                  checked={leads.length > 0 && selected.size === leads.length}
                  onChange={(e) => leads.forEach((l) => {
                    const has = selected.has(l.id);
                    if (e.target.checked && !has) onToggleSelect(l.id);
                    if (!e.target.checked && has) onToggleSelect(l.id);
                  })}
                />
              </TableCell>
            )}
            <TableCell>Name</TableCell>
            <TableCell>Stage</TableCell>
            <TableCell>Next</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {grouped
            ? stages.flatMap((st) => {
                const g = leads.filter((l) => l.stage === st);
                if (!g.length) return [];
                return [
                  <TableRow key={"hd-" + st}>
                    <TableCell colSpan={selectable ? 5 : 4} sx={{ bgcolor: tokens.surface2, fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em", height: 34 }}>
                      {stageLabel(st, kind)} ({g.length})
                    </TableCell>
                  </TableRow>,
                  ...rows(g),
                ];
              })
            : rows(leads)}
        </TableBody>
      </Table>
    </Box>
  );
}

function MobileLeadsList({
  leads,
  stages,
  kind,
  filter,
  selectable,
  selected,
  onToggleSelect,
  onRowSelect,
  onOpen,
  onCall,
  onStagePick,
}: {
  leads: LeadRow[];
  stages: Stage[];
  /** Only affects wording — a "general" pipeline shows neutral stage names. */
  kind: PipelineKind;
  filter: "All" | Stage;
  selectable: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onRowSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
  onCall: (id: string) => void;
  onStagePick: (id: string, stage: Stage) => void;
}) {
  void onToggleSelect;
  const canSeeFullPhone = useCanSeeFullPhone();
  if (leads.length === 0) {
    return <EmptyLeadsState filter={filter} />;
  }

  const grouped = filter === "All";

  const card = (l: LeadRow, idx = 0) => (
    <Box
      key={l.id}
      data-tour={idx === 0 ? "lead-row" : undefined}
      onClick={selectable ? (e) => onRowSelect(l.id, e.shiftKey) : undefined}
      sx={{
        borderBottom: `8px solid ${tokens.bg}`,
        bgcolor: selectable && selected.has(l.id) ? tokens.primaryBg : l.due && !DEAD_STAGES.includes(l.stage) ? tokens.amberTint : "background.paper",
        p: "12px 16px",
        display: selectable ? "flex" : "block",
        gap: 1,
        cursor: selectable ? "pointer" : "default",
      }}
    >
      {selectable && (
        // Display-only: the whole card is the tap target, so the box must not
        // steal the tap or warn about a controlled input with no onChange.
        <Checkbox size="small" checked={selected.has(l.id)} readOnly tabIndex={-1} sx={{ p: 0, mt: 0.25, alignSelf: "flex-start", pointerEvents: "none" }} />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
      <Box onClick={selectable ? undefined : () => onOpen(l.id)} sx={{ fontWeight: 500, fontSize: 15, color: tokens.primaryDark, cursor: selectable ? "inherit" : "pointer" }}>
        {l.name}
        {l.stage === "New Lead" && <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: tokens.green, ml: 0.75 }}>NEW</Box>}
      </Box>
      <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
        {canSeeFullPhone ? l.phone : maskPhone(l.phone)}
        <Box component="span" sx={{ color: "text.disabled", mx: 0.75 }}>·</Box>
        {timeAgo(l.created_at)}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 0.75 }}>
        <StageMenu current={l.stage} stages={stages} kind={kind} onPick={(s) => onStagePick(l.id, s)}>
          {(open) => (
            <Box
              component="button"
              onClick={(e) => { e.stopPropagation(); open(e); }}
              sx={{ border: 0, bgcolor: "transparent", fontSize: 14, color: DEAD_STAGES.includes(l.stage) ? "text.disabled" : "text.primary", p: 0, cursor: "pointer" }}
            >
              {l.stage}
            </Box>
          )}
        </StageMenu>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, fontSize: 13, color: l.reminder_at ? "#e65100" : "text.secondary" }}>
          {l.reminder_at && <AccessTimeIcon sx={{ fontSize: 14 }} />}
          {l.next_label}
        </Box>
      </Box>
      {!selectable && !DEAD_STAGES.includes(l.stage) && (
        <Box
          component="a"
          href={`tel:${l.phone.replace(/\s/g, "")}`}
          onClick={() => setTimeout(() => onCall(l.id), 150)}
          data-tour="call"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            bgcolor: tokens.green,
            color: "#fff",
            borderRadius: "4px",
            p: "13px",
            fontWeight: 500,
            fontSize: 13,
            textTransform: "uppercase",
            textDecoration: "none",
            mt: 1.25,
            "&:hover": { bgcolor: tokens.greenDark },
          }}
        >
          <CallIcon fontSize="small" /> Call
        </Box>
      )}
      </Box>
    </Box>
  );

  return (
    <Box>
      {grouped
        ? stages.flatMap((st) => {
            const g = leads.filter((l) => l.stage === st);
            if (!g.length) return [];
            return [
              <Box
                key={"hd-" + st}
                sx={{ bgcolor: tokens.surface2, fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em", p: "8px 16px", borderBottom: `1px solid ${tokens.divider}` }}
              >
                {stageLabel(st, kind)} ({g.length})
              </Box>,
              ...g.map((l, i) => card(l, i)),
            ];
          })
        : leads.map((l, i) => card(l, i))}
    </Box>
  );
}
