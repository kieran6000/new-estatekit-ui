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
  Radio,
  RadioGroup,
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
import NotificationsIcon from "@mui/icons-material/Notifications";
import CallIcon from "@mui/icons-material/Call";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloseIcon from "@mui/icons-material/Close";
import PhoneCallbackIcon from "@mui/icons-material/PhoneCallback";
import { useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { tokens } from "../theme";
import { DEAD_STAGES, PIPELINE_KIND_LABEL, PIPELINE_STAGES, type LeadRow, type OutcomeStep, type Pipeline, type PipelineKind, type Stage } from "../types";
import { dueLeads, pipelineKindFor, sortLeadsForList, STEP_FOR_STAGE } from "../lib/stageLogic";
import { timeAgo } from "../lib/timeAgo";
import { useLeads, useUpdateLeadStage } from "../hooks/useLeads";
import { useAddPipeline, usePipelines, useSyncPipelineSheet } from "../hooks/usePipelines";
import { useIsOperator } from "../hooks/useAutomations";
import { useSnack } from "../hooks/useSnack";
import { maskPhone } from "../lib/format";
import { getPendingCall, clearPendingCall, type PendingCall } from "../lib/pendingCall";
import { syncFbLeads } from "../api/leadPages";
import { getActiveAgentIdSync } from "../api/_client";
import GSheetIcon from "../components/GSheetIcon";
import StageMenu from "../components/StageMenu";
import OutcomeSheet from "../components/OutcomeSheet";
import FocusCallModal from "../components/FocusCallModal";

export default function LeadsPage() {
  const navigate = useNavigate();
  const { data: leads = [], isLoading: leadsLoading } = useLeads();
  const { data: pipelines = [], isLoading: pipelinesLoading } = usePipelines();
  const updateStage = useUpdateLeadStage();
  const syncSheet = useSyncPipelineSheet();
  const showSnack = useSnack();
  const qc = useQueryClient();
  const { data: isOperator } = useIsOperator();

  const pipelineStorageKey = `estatekit_last_pipeline_${getActiveAgentIdSync() || "me"}`;

  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pipelineId, setPipelineId] = useState<string | null>(() => {
    try { return localStorage.getItem(pipelineStorageKey); } catch { return null; }
  });
  const [reloading, setReloading] = useState(false);
  const [pipelineMenuAnchor, setPipelineMenuAnchor] = useState<HTMLElement | null>(null);
  const [addPipelineOpen, setAddPipelineOpen] = useState(false);
  const [filter, setFilter] = useState<"All" | Stage>("All");
  const [outcomeLeadId, setOutcomeLeadId] = useState<string | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [stageSheet, setStageSheet] = useState<{ leadId: string; step: OutcomeStep; stage: Stage } | null>(null);

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

  const pipelineLeads = useMemo(
    () => (activePipeline ? leads.filter((l) => l.pipeline_id === activePipeline.id) : []),
    [leads, activePipeline],
  );

  const due = useMemo(() => dueLeads(pipelineLeads), [pipelineLeads]);
  const remCount = due.filter((l) => l.reminder_at).length;
  const freshCount = due.length - remCount;

  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim();
    return sortLeadsForList(pipelineLeads).filter((l) => {
      if (filter !== "All" && l.stage !== filter) return false;
      if (!query) return true;
      return l.name.toLowerCase().includes(query) || l.phone.replace(/\s/g, "").includes(query.replace(/\s/g, ""));
    });
  }, [pipelineLeads, filter, q]);

  const outcomeLead = leads.find((l) => l.id === outcomeLeadId);
  const stageSheetLead = leads.find((l) => l.id === stageSheet?.leadId);
  const outcomeLeadKind = outcomeLead ? pipelineKindFor(outcomeLead, pipelines) : "seller";
  const stageSheetLeadKind = stageSheetLead ? pipelineKindFor(stageSheetLead, pipelines) : "seller";

  function handleStagePick(id: string, stage: Stage) {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    const step = STEP_FOR_STAGE[stage];
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

  if (leadsLoading || pipelinesLoading) return <LeadsPageSkeleton />;
  if (!activePipeline) return null;

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important", px: "8px 8px 8px 16px" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500, flex: 1 }}>Leads</Typography>
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
        <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, display: "flex", alignItems: "center", gap: 1.25, p: "10px 16px" }}>
          <SearchIcon sx={{ color: "text.disabled" }} />
          <InputBase placeholder="Search leads" value={q} onChange={(e) => setQ(e.target.value)} fullWidth autoFocus />
        </Box>
      )}


      {/* Operator-only: agents don't get the "to call today" / Start calling bar. */}
      {isOperator && (
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 1, gap: 1.75, p: "14px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <NotificationsIcon sx={{ color: due.length ? tokens.primary : tokens.green }} />
        <Box sx={{ flex: 1, minWidth: 140 }}>
          <Typography sx={{ fontWeight: 500, fontSize: 15 }}>
            {due.length === 0 ? "You're all caught up" : `${due.length} to call today`}
          </Typography>
          <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
            {due.length === 0
              ? "No one to call today."
              : [freshCount && `${freshCount} new`, remCount && `${remCount} follow-up${remCount > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, ml: "auto" }}>
          <Box
            component="button"
            onClick={() => navigate("/overview")}
            sx={{ border: 0, bgcolor: "transparent", color: "text.secondary", fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", "&:hover": { color: tokens.primary } }}
          >
            Full numbers ›
          </Box>
          {due.length > 0 && (
            <Box
              component="button"
              onClick={() => setFocusOpen(true)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                border: 0,
                bgcolor: "transparent",
                color: tokens.primary,
                fontWeight: 500,
                fontSize: 14,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                px: 1.5,
                py: 1,
                borderRadius: "4px",
                cursor: "pointer",
                "&:hover": { bgcolor: tokens.primaryBg },
              }}
            >
              <CallIcon fontSize="small" /> Start calling
            </Box>
          )}
        </Box>
      </Box>
      )}

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: "8px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Box
          component="button"
          onClick={(e) => setPipelineMenuAnchor(e.currentTarget)}
          sx={{ display: "flex", alignItems: "center", gap: 0.25, border: `1px solid ${tokens.divider}`, borderRadius: "4px", bgcolor: "#fff", fontSize: 13, fontWeight: 500, p: "7px 6px 7px 12px", cursor: "pointer" }}
        >
          {activePipeline.name} pipeline <ArrowDropDownIcon fontSize="small" />
        </Box>
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
        <Box sx={{ flex: 1 }} />

        <IconButton
          onClick={reloadLeads}
          disabled={reloading}
          title="Reload leads"
          sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "4px", width: 34, height: 34 }}
        >
          <RefreshIcon sx={{ fontSize: 18, color: "text.secondary", animation: reloading ? "spin 0.8s linear infinite" : "none", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />
        </IconButton>

        {/* Labelled so it's obvious what it does, rather than a bare icon. */}
        <Button
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
            : activePipeline.sheet_url ? "Open in Sheets" : "Export to Sheets"}
        </Button>
      </Box>

      <Box sx={{ p: "10px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", mb: 0.75 }}>
          Filter by stage
        </Typography>
        <Box sx={{ display: "flex", gap: 0.75, overflowX: "auto" }}>
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

      <LeadsTable
        leads={filtered}
        stages={stagesForPipeline}
        filter={filter}
        onOpen={(id) => navigate(`/leads/${id}`)}
        onCall={(id) => setOutcomeLeadId(id)}
        onStagePick={handleStagePick}
      />
      

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
  filter,
  onOpen,
  onCall,
  onStagePick,
}: {
  leads: LeadRow[];
  stages: Stage[];
  filter: "All" | Stage;
  onOpen: (id: string) => void;
  onCall: (id: string) => void;
  onStagePick: (id: string, stage: Stage) => void;
}) {
  const isMobile = useMediaQuery("(max-width:639px)");
  const { data: isOperator } = useIsOperator();
  if (isMobile) {
    return <MobileLeadsList leads={leads} stages={stages} filter={filter} onOpen={onOpen} onCall={onCall} onStagePick={onStagePick} />;
  }

  if (leads.length === 0) {
    return <EmptyLeadsState filter={filter} />;
  }

  const grouped = filter === "All";

  const rows = (group: LeadRow[]) =>
    group.map((l) => (
      <TableRow key={l.id} hover sx={l.due && !DEAD_STAGES.includes(l.stage) ? { bgcolor: tokens.amberTint } : DEAD_STAGES.includes(l.stage) ? { color: tokens.ink3 } : undefined}>
        <TableCell sx={{ py: 1 }}>
          <Box component="span" onClick={() => onOpen(l.id)} sx={{ fontWeight: 500, fontSize: 15, color: tokens.primaryDark, cursor: "pointer" }}>
            {l.name}
            {l.stage === "New Lead" && <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: tokens.green, ml: 0.75 }}>NEW</Box>}
          </Box>
          <Typography sx={{ color: "text.secondary", fontSize: 13, display: "block" }}>
            {isOperator ? l.phone : maskPhone(l.phone)}
            <Box component="span" sx={{ color: "text.disabled", mx: 0.75 }}>·</Box>
            {timeAgo(l.created_at)}
          </Typography>
        </TableCell>
        <TableCell>
          <StageMenu current={l.stage} stages={stages} onPick={(s) => onStagePick(l.id, s)}>
            {(open) => (
              <Box
                component="button"
                onClick={open}
                sx={{ border: 0, bgcolor: "transparent", fontSize: 14, color: "inherit", display: "inline-flex", alignItems: "center", gap: 0.75, cursor: "pointer", p: "6px 0" }}
              >
                {l.stage}
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
          {!DEAD_STAGES.includes(l.stage) && (
            <Box
              component="a"
              href={`tel:${l.phone.replace(/\s/g, "")}`}
              onClick={() => setTimeout(() => onCall(l.id), 150)}
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
                    <TableCell colSpan={4} sx={{ bgcolor: "#eef1f3", fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em", height: 34 }}>
                      {st} ({g.length})
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
  filter,
  onOpen,
  onCall,
  onStagePick,
}: {
  leads: LeadRow[];
  stages: Stage[];
  filter: "All" | Stage;
  onOpen: (id: string) => void;
  onCall: (id: string) => void;
  onStagePick: (id: string, stage: Stage) => void;
}) {
  const { data: isOperator } = useIsOperator();
  if (leads.length === 0) {
    return <EmptyLeadsState filter={filter} />;
  }

  const grouped = filter === "All";

  const card = (l: LeadRow) => (
    <Box
      key={l.id}
      sx={{
        borderBottom: `8px solid ${tokens.bg}`,
        bgcolor: l.due && !DEAD_STAGES.includes(l.stage) ? tokens.amberTint : "background.paper",
        p: "12px 16px",
      }}
    >
      <Box onClick={() => onOpen(l.id)} sx={{ fontWeight: 500, fontSize: 15, color: tokens.primaryDark, cursor: "pointer" }}>
        {l.name}
        {l.stage === "New Lead" && <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: tokens.green, ml: 0.75 }}>NEW</Box>}
      </Box>
      <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
        {isOperator ? l.phone : maskPhone(l.phone)}
        <Box component="span" sx={{ color: "text.disabled", mx: 0.75 }}>·</Box>
        {timeAgo(l.created_at)}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 0.75 }}>
        <StageMenu current={l.stage} stages={stages} onPick={(s) => onStagePick(l.id, s)}>
          {(open) => (
            <Box
              component="button"
              onClick={open}
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
      {!DEAD_STAGES.includes(l.stage) && (
        <Box
          component="a"
          href={`tel:${l.phone.replace(/\s/g, "")}`}
          onClick={() => setTimeout(() => onCall(l.id), 150)}
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
                sx={{ bgcolor: "#eef1f3", fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em", p: "8px 16px", borderBottom: `1px solid ${tokens.divider}` }}
              >
                {st} ({g.length})
              </Box>,
              ...g.map(card),
            ];
          })
        : leads.map(card)}
    </Box>
  );
}
