import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  InputBase,
  ListItemIcon,
  Menu,
  MenuItem,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import BoltIcon from "@mui/icons-material/Bolt";
import ScheduleIcon from "@mui/icons-material/Schedule";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import EmailIcon from "@mui/icons-material/Email";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import FlagIcon from "@mui/icons-material/Flag";
import AlarmIcon from "@mui/icons-material/Alarm";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import BlockIcon from "@mui/icons-material/Block";
import CloseIcon from "@mui/icons-material/Close";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import SearchIcon from "@mui/icons-material/Search";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PersonIcon from "@mui/icons-material/Person";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import HistoryIcon from "@mui/icons-material/History";
import SettingsIcon from "@mui/icons-material/SettingsOutlined";
import { Link as RouterLink, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { tokens } from "../theme";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { ACTIVE_AGENT_EVENT, getActiveAgentIdSync, listAgentProfiles } from "../api/_client";
import {
  addStandardWorkflows, countLeadsInWorkflows, deleteWorkflow, getWorkflow, isSaved, listAccountWorkflows, listTemplateWorkflows, listWorkflowLog,
  lastTriggeredWorkflows, listWorkflowRuns, saveWorkflow, type LeadInWorkflow, type OpenedWorkflow,
} from "../api/workflows";
import { useFollowAccount } from "../hooks/useFollowLeadAccount";
import { listPath, workflowPath, type BackTo, type Scope } from "../lib/automationsPaths";
import { trackActivity } from "../lib/activity";
import { useSnack } from "../hooks/useSnack";
import WhatsAppPreview from "./WhatsAppPreview";
import WaitingList from "./WaitingList";
import { getAccountAutomationsPaused, setAccountAutomationsPaused } from "../api/automations";
import SendToMobileIcon from "@mui/icons-material/SendToMobile";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import CodeIcon from "@mui/icons-material/Code";
import InsertEmoticonIcon from "@mui/icons-material/InsertEmoticon";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import { MAX_WA_FILE_MB, uploadWhatsAppFile } from "../api/workflowFiles";
import type { Attachment } from "../lib/workflow";
import { PillEditor, type PillEditorHandle } from "./PillEditor";
import { getAccountVocab } from "../api/accountVocab";
import LeadTag from "./LeadTag";
import { PlainHead, SortHead, sortRows, useTableSort } from "./SortHead";
import {
  BRANCH_CHECKS, EXITS, FILTER_FIELDS, STEP_TYPES, TEMPLATES, TRIGGERS,
  allowedSteps, badFields, branchLabel, checkKind, optionsFor, setAccountVocab, valueLabel, defaultBranchValue, fieldGroups, fieldInfo, fieldToken, fieldsFor, filterSummary, findStep,
  insertStep, locate, moveStep, newStep, ordinal, stepAtPos, rememberTags, tagsIn, problemCount, removeStep, stepSummary, stepTitle, timeLabel, timeline,
  replaceField, sampleFields, triggerOfKind, triggerSummary, unitLabel, updateStep, usedFields, validate, waitMinutes,
  type BranchCheck, type Exit, type Filter, type MessageKind, type Path, type Problems, type Settings, type Step, type StepType, type Trigger,
  type Unit, type Workflow,
} from "../lib/workflow";

// Workflow builder: trigger → only if → steps (with waits and if/else
// paths) → stop early when. The model, every edit and every check live in
// lib/workflow.ts (unit-tested); this file only draws it and calls those.
//
// Saved per account (api/workflows.ts), plus a shared template library. The
// engine that runs them is supabase/functions/run-automations/workflows.ts.

const STEP_ICON: Record<StepType, React.ReactNode> = {
  wait: <ScheduleIcon />, whatsapp_agent: <WhatsAppIcon />, whatsapp_lead: <SendToMobileIcon />, email_lead: <EmailIcon />, branch: <CallSplitIcon />,
  set_stage: <FlagIcon />, reminder: <AlarmIcon />, tag: <LocalOfferIcon />,
};

// Icon tiles: mid-tone fills with white icons, readable in light and dark.
const STEP_COLOR: Record<StepType, string> = {
  wait: "#607d8b", whatsapp_agent: "#1a8f45", whatsapp_lead: "#d84315", email_lead: "#1565c0", branch: "#455a64",
  set_stage: "#6a1b9a", reminder: "#ad1457", tag: "#00796b",
};

const SAMPLE_LEAD = { id: "sample", name: "Thandi Mokoena", phone: "082 555 0199", stage: "No Answer", next_label: "Retry today" };
// Examples come from lib/workflow (fieldInfo), so the field buttons, the
// previews and the help all say the same thing.
const SAMPLE_FIELDS = sampleFields();
const fill = (t: string, trigger?: Trigger) => {
  const f = trigger ? sampleFields(trigger) : SAMPLE_FIELDS;
  return t.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => f[k] ?? m);
};

// ── Pages: list and editor, each at its own address (lib/automationsPaths) ──

/** The account in the switcher; your own when you aren't managing anyone.
 *  Re-renders when something switches accounts. */
function useAgentId(): string {
  const { user } = useAuth();
  const [id, setId] = useState(() => getActiveAgentIdSync() ?? user?.id ?? "");
  useEffect(() => {
    const sync = () => setId(getActiveAgentIdSync() ?? user?.id ?? "");
    sync();
    window.addEventListener(ACTIVE_AGENT_EVENT, sync);
    return () => window.removeEventListener(ACTIVE_AGENT_EVENT, sync);
  }, [user?.id]);
  return id;
}

/** The account's own pipelines, forms and tags, for the pick lists and checks
 *  (lib/workflow.ts). Templates get none: they're copied to every account, so
 *  they stay generic ("any seller pipeline"). Returns once it's set, so the
 *  page redraws with the account's choices. */
function useAccountVocab(agentId: string, forAccount: boolean): boolean {
  const { data, isLoading } = useQuery({ queryKey: ["accountVocab", agentId], queryFn: () => getAccountVocab(agentId), enabled: !!agentId && forAccount, staleTime: 60_000 });
  // Module state, set as the page draws so the first draw already has it.
  // Setting it again with the same data changes nothing.
  setAccountVocab(forAccount ? data ?? null : null);
  return !forAccount || !isLoading;
}

/** Tags added by any workflow can be checked for in the others. */
function useKnownTags(agentId: string) {
  const { data: accountWfs } = useQuery({ queryKey: ["workflows", agentId], queryFn: () => listAccountWorkflows(agentId), enabled: !!agentId });
  const { data: templates } = useQuery({ queryKey: ["workflowTemplates"], queryFn: listTemplateWorkflows });
  useEffect(() => { rememberTags([...(accountWfs ?? []), ...(templates ?? [])].flatMap((w) => tagsIn(w.steps))); }, [accountWfs, templates]);
}

const Loading = () => <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}><CircularProgress /></Box>;

/** Unsaved edits in the open editor, so the sidebar can ask before it opens
 *  another automation (the editor's own back button asks the same). */
let editorDirty = false;

/** The Automations sidebar: "Automations" (search, sort, a switch per row)
 *  and "Coming up" (everything waiting to go out). On a computer it sits
 *  left of the open automation; on a phone it's the whole screen. */
export function WorkflowListPage({ scope, selectedId }: { scope: Scope; selectedId?: string }) {
  const agentId = useAgentId();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [picker, setPicker] = useState(false);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  useKnownTags(agentId);
  const vocabReady = useAccountVocab(agentId, true);

  // ?account=<id> (from a client's page): switch to that account first.
  const wanted = params.get("account");
  useFollowAccount(wanted ? { agent_id: wanted } : null, "account");
  useEffect(() => {
    if (wanted && wanted === agentId) setParams((p) => { p.delete("account"); return p; }, { replace: true });
  }, [wanted, agentId, setParams]);

  const { data: workflows, isLoading, isError } = useQuery({ queryKey: ["workflows", agentId], queryFn: () => listAccountWorkflows(agentId), enabled: !!agentId });
  const { data: counts = {} } = useQuery({ queryKey: ["workflowLeadCounts", agentId], queryFn: () => countLeadsInWorkflows(agentId), enabled: !!agentId, refetchInterval: 30_000 });
  const { data: lastRun = {} } = useQuery({ queryKey: ["workflowLastTriggered", agentId], queryFn: () => lastTriggeredWorkflows(agentId), enabled: !!agentId, refetchInterval: 60_000 });

  // Leaving an automation with unsaved edits asks first.
  const go = (fn: () => void) => (editorDirty ? setPendingNav(() => fn) : fn());
  const create = (w: Workflow) => {
    setPicker(false);
    go(() => navigate(`${listPath(scope)}/new`, { state: { draft: { ...w, published: false } } }));
  };

  if (!agentId || isLoading || !vocabReady) return <Loading />;
  if (isError) return <Alert severity="error" sx={{ m: 2 }}>Couldn't load automations. Refresh to try again.</Alert>;

  return (
    <>
      <Sidebar
        agentId={agentId}
        workflows={workflows ?? []}
        counts={counts}
        lastRun={lastRun}
        selectedId={selectedId}
        onOpen={(id) => go(() => navigate(workflowPath(id)))}
        onCreate={() => setPicker(true)}
      />
      <Dialog open={picker} onClose={() => setPicker(false)} fullWidth maxWidth="sm">
        <DialogTitle>New automation</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {TEMPLATES.map((t) => <TemplateButton key={t.name} name={t.name} blurb={t.blurb} onClick={() => create(t.make())} />)}
        </DialogContent>
      </Dialog>
      <Dialog open={!!pendingNav} onClose={() => setPendingNav(null)}>
        <DialogTitle>Leave without saving?</DialogTitle>
        <DialogContent><Typography sx={{ fontSize: 14 }}>Your changes to this automation will be lost.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingNav(null)}>Keep editing</Button>
          <Button color="error" onClick={() => { const fn = pendingNav; setPendingNav(null); editorDirty = false; fn?.(); }}>Leave</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export function WorkflowEditorPage({ scope, embedded = false }: { scope: Scope; embedded?: boolean }) {
  const { id = "" } = useParams();
  const agentId = useAgentId();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const showSnack = useSnack();
  useKnownTags(agentId);
  const vocabReady = useAccountVocab(agentId, scope === "account");
  const isNew = id === "new";
  const draft = (location.state as { draft?: Workflow } | null)?.draft;
  const backTo: BackTo = (location.state as { back?: BackTo } | null)?.back ?? { to: listPath(scope), label: scope === "templates" ? "Templates" : "Automations" };

  const { data: opened, isLoading, isError } = useQuery({ queryKey: ["workflow", id], queryFn: () => getWorkflow(id), enabled: !isNew });
  // A workflow from another account (a link from Scheduled → All accounts,
  // or from a client's page): switch to that account, like opening a lead.
  useFollowAccount(opened?.agentId ? { agent_id: opened.agentId } : null, "workflow");

  if (!vocabReady) return <Loading />;
  if (isNew) {
    // A refresh loses the unsaved draft: back to the list rather than a blank page.
    if (!draft) return <Navigate to={listPath(scope)} replace />;
  } else {
    if (isLoading) return <Loading />;
    if (isError) return <Alert severity="error" sx={{ m: 2 }}>Couldn't load this workflow. Refresh to try again.</Alert>;
    if (!opened) {
      return (
        <Box sx={{ p: 4, textAlign: "center" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>This workflow doesn't exist any more</Typography>
          <Button component={RouterLink} to={listPath(scope)} sx={{ mt: 2 }}>Back to {scope === "templates" ? "templates" : "workflows"}</Button>
        </Box>
      );
    }
    // A template's address under /workflows (or the other way round): fix it.
    const actual: Scope = opened.agentId ? "account" : "templates";
    if (actual !== scope) return <Navigate to={`${workflowPath(id, actual)}${location.search}`} replace state={location.state} />;
  }

  const workflow = isNew ? draft! : opened!.workflow;
  const owner = isNew ? (scope === "account" ? agentId : null) : opened!.agentId;
  const isTemplate = scope === "templates";

  async function save(w: Workflow): Promise<Workflow> {
    const saved = await saveWorkflow(w, owner);
    trackActivity("automation_toggled", { agentId: owner ?? undefined, detail: `${isTemplate ? "Template" : "Workflow"} saved: ${saved.name} (${saved.published ? "on" : "off"})` });
    qc.setQueryData(["workflow", saved.id], { workflow: saved, agentId: owner } satisfies OpenedWorkflow);
    void qc.invalidateQueries({ queryKey: isTemplate ? ["workflowTemplates"] : ["workflows", owner] });
    // A new one gets its real address now, so a refresh keeps it.
    if (isNew) navigate(`${workflowPath(saved.id, scope)}${location.search}`, { replace: true, state: { back: backTo } });
    return saved;
  }

  async function remove() {
    try {
      await deleteWorkflow(workflow.id);
      await qc.invalidateQueries({ queryKey: isTemplate ? ["workflowTemplates"] : ["workflows", owner] });
      qc.removeQueries({ queryKey: ["workflow", workflow.id] });
      showSnack(`Deleted "${workflow.name}"`);
      navigate(listPath(scope));
    } catch (e) {
      console.error(e);
      showSnack("Couldn't delete it. Try again.");
    }
  }

  return (
    <Editor
      // Remounts when it's switched on/off from the sidebar.
      key={isNew ? "new" : `${workflow.id}:${workflow.published}`}
      embedded={embedded}
      initial={workflow}
      isTemplate={isTemplate}
      backTo={backTo}
      onSave={save}
      onBack={() => navigate(backTo.to)}
      onDelete={() => void remove()}
    />
  );
}

function TemplateButton({ name, blurb, onClick }: { name: string; blurb: string; onClick: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{ textAlign: "left", font: "inherit", color: "inherit", bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "6px", p: 1.5, cursor: "pointer", "&:hover, &:focus-visible": { borderColor: "primary.main", bgcolor: tokens.hover, outline: "none" } }}
    >
      <Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>{name}</Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{blurb}</Typography>
    </Box>
  );
}

/** An account with no workflows at all (made before workflows, or every one
 *  deleted): one tap gives it the standard set every new account gets. */
function StandardSetBar({ agentId, workflows }: { agentId: string; workflows: Workflow[] }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [busy, setBusy] = useState(false);
  if (workflows.length) return null;

  async function add() {
    setBusy(true);
    try {
      const n = await addStandardWorkflows(agentId);
      trackActivity("automation_toggled", { agentId, detail: `Added the standard workflows (${n})` });
      await qc.invalidateQueries({ queryKey: ["workflows", agentId] });
      showSnack(n ? `Added ${n} standard workflow${n === 1 ? "" : "s"}.` : "This account already has them.");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't add them. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // The button goes under the words on phones (an Alert action squeezes
    // the text into a sliver there), beside them on wider screens.
    <Alert severity="info" sx={{ mb: 2, "& .MuiAlert-message": { flex: 1, display: "flex", flexDirection: { xs: "column", sm: "row" }, alignItems: { xs: "stretch", sm: "center" }, gap: 1.5 } }}>
      <Box sx={{ flex: 1 }}>This account has no workflows, so no automations run for it. Add the standard set (the same as every new account), then change what you like.</Box>
      <Button variant="contained" disabled={busy} onClick={() => void add()} sx={{ flex: "none", whiteSpace: "nowrap", minHeight: 44 }}>Add the standard workflows</Button>
    </Alert>
  );
}

/** What a workflow sends, in words: "WhatsApp to agent", "Email to lead". */
function sendsText(steps: Step[]): string {
  const kinds = new Set<StepType>();
  const walk = (list: Step[]) => list.forEach((s) => { kinds.add(s.type); if (s.type === "branch") { walk(s.yes); walk(s.no); } });
  walk(steps);
  const out = [
    kinds.has("whatsapp_agent") && "WhatsApp to agent",
    kinds.has("whatsapp_lead") && "WhatsApp to lead",
    kinds.has("email_lead") && "Email to lead",
  ].filter(Boolean);
  return out.length ? out.join(" + ") : "Updates the lead";
}

/** Every word a workflow holds: its messages and emails (subjects and
 *  bodies), tags, stages, notes. Placeholders count by their plain name too,
 *  so "first name" finds {{first_name}}. */
function wordsIn(steps: Step[]): string[] {
  const out: string[] = [];
  const walk = (list: Step[]) => list.forEach((s) => {
    for (const [k, v] of Object.entries(s)) {
      if (k === "id" || k === "type") continue;
      if (typeof v === "string" && v.trim()) out.push(v.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, f: string) => `${f.replace(/_/g, " ")}`));
    }
    if (s.type === "branch") { walk(s.yes); walk(s.no); }
  });
  walk(steps);
  return out;
}

/** Matches when every word typed is somewhere in the workflow. Returns the
 *  message line it was found in (shown under the row) when the name alone
 *  wouldn't explain the match, "" when the name does, null for no match. */
function searchMatch(w: Workflow, query: string): string | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const head = `${w.name} ${triggerSummary(w.trigger)} ${sendsText(w.steps)}`.toLowerCase();
  const texts = wordsIn(w.steps);
  const all = `${head} ${texts.join(" ")}`.toLowerCase();
  if (!words.every((x) => all.includes(x))) return null;
  if (words.every((x) => head.includes(x))) return "";
  const hit = words.find((x) => !head.includes(x))!;
  const text = texts.find((t) => t.toLowerCase().includes(hit)) ?? "";
  const flat = text.replace(/\s+/g, " ");
  const at = flat.toLowerCase().indexOf(hit);
  const from = Math.max(0, at - 30);
  return `${from ? "…" : ""}${flat.slice(from, at + hit.length + 50)}${at + hit.length + 50 < flat.length ? "…" : ""}`;
}

function ago(iso: string | undefined): string {
  if (!iso) return "Never triggered";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 2) return "Triggered just now";
  if (mins < 60) return `Triggered ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Triggered ${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days < 60 ? `Triggered ${days}d ago` : `Triggered ${Math.round(days / 30)} months ago`;
}

type SortBy = "on" | "recent" | "name";
const SORT_LABEL: Record<SortBy, string> = { on: "On first", recent: "Last triggered", name: "A–Z" };
const SORT_KEY = "ek.automations.sort";

function Sidebar({ agentId, workflows, counts, lastRun, selectedId, onOpen, onCreate }: {
  agentId: string; workflows: Workflow[]; counts: Record<string, number>; lastRun: Record<string, string>;
  selectedId?: string; onOpen: (id: string) => void; onCreate: () => void;
}) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [tab, setTab] = useState<"automations" | "coming">("automations");
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    try { const v = localStorage.getItem(SORT_KEY); return v === "recent" || v === "name" ? v : "on"; } catch { return "on"; }
  });
  const pickSort = (v: SortBy) => { setSortBy(v); try { localStorage.setItem(SORT_KEY, v); } catch { /* fine */ } };
  const [busy, setBusy] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);
  // By id, not "my profile": that one can lag a moment behind an account switch.
  const { data: profiles = [] } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles, staleTime: 5 * 60_000 });
  const accountName = profiles.find((x) => x.agent_id === agentId)?.display_name || "This account";
  const { data: paused = false } = useQuery({ queryKey: ["automationsPaused", agentId], queryFn: () => getAccountAutomationsPaused(agentId) });
  // A switched-off workflow's queue never sends: the engine cancels each run
  // when it comes due.
  const waiting = (w: Workflow) => (w.published ? counts[w.id] ?? 0 : 0);
  const totalWaiting = workflows.reduce((n, w) => n + waiting(w), 0);

  const matched = workflows.map((w) => ({ w, hit: searchMatch(w, q) })).filter((x) => x.hit !== null);
  const time = (w: Workflow) => (lastRun[w.id] ? Date.parse(lastRun[w.id]) : 0);
  matched.sort((a, b) =>
    sortBy === "name" ? a.w.name.localeCompare(b.w.name)
    : sortBy === "recent" ? time(b.w) - time(a.w) || a.w.name.localeCompare(b.w.name)
    : Number(b.w.published) - Number(a.w.published) || a.w.name.localeCompare(b.w.name));

  async function toggle(w: Workflow, next: boolean) {
    // The open automation holds its own copy: unsaved edits there would be
    // lost or undo this, so it changes there instead.
    if (w.id === selectedId && editorDirty) { showSnack("Save or undo your changes to it first."); return; }
    const key = ["workflows", agentId];
    setBusy(w.id);
    qc.setQueryData(key, (old: Workflow[] | undefined) => old?.map((x) => (x.id === w.id ? { ...x, published: next } : x)));
    try {
      const saved = await saveWorkflow({ ...w, published: next }, agentId);
      qc.setQueryData(["workflow", saved.id], { workflow: saved, agentId } satisfies OpenedWorkflow);
      trackActivity("automation_toggled", { agentId, detail: `Workflow ${next ? "on" : "off"}: ${w.name}` });
      const n = waiting(w);
      showSnack(next ? `"${w.name}" is on` : `"${w.name}" is off${n ? `. Its ${n} waiting won't send.` : ""}`);
    } catch (e) {
      console.error(e);
      showSnack("Couldn't change that. Try again.");
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["workflowLeadCounts", agentId] });
    }
  }

  async function setPaused(next: boolean) {
    setPausing(true);
    try {
      await setAccountAutomationsPaused(agentId, next);
      trackActivity("automation_toggled", { agentId, detail: next ? "Paused all automations for this account" : "Turned automations back on for this account" });
      await qc.invalidateQueries({ queryKey: ["automationsPaused", agentId] });
      showSnack(next ? "All automations paused for this account" : "Automations back on for this account");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't change that. Try again.");
    } finally {
      setPausing(false);
    }
  }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "background.paper", minHeight: 0 }}>
      {/* Account-wide switch: pauses everything at once, queue included. */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, height: 64, flex: "none" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h1" sx={{ fontSize: 18, fontWeight: 600 }}>Automations</Typography>
          <Typography noWrap sx={{ fontSize: 12.5, color: paused ? tokens.orange : "text.secondary" }}>
            {accountName} · {paused ? "All paused" : "Running"}
          </Typography>
        </Box>
        <Tooltip title={paused ? "Turn automations back on for this account" : "Pause every automation for this account"}>
          <Switch checked={!paused} disabled={pausing} onChange={(e) => void setPaused(!e.target.checked)} slotProps={{ input: { "aria-label": "Automations on for this account" } }} />
        </Tooltip>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ flex: "none", borderBottom: `1px solid ${tokens.divider}`, minHeight: 44, "& .MuiTab-root": { minHeight: 44, textTransform: "none", fontSize: 14 } }}>
        <Tab value="automations" label={`Automations (${workflows.length})`} />
        <Tab value="coming" label={`Coming up${totalWaiting ? ` (${totalWaiting})` : ""}`} />
      </Tabs>

      {tab === "automations" ? (
        <>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", px: 1.5, py: 1.25, flex: "none" }}>
            <TextField
              size="small"
              placeholder="Search names and messages"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              fullWidth
              slotProps={{ input: {
                startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                endAdornment: q ? <InputAdornment position="end"><IconButton size="small" aria-label="Clear search" onClick={() => setQ("")}><CloseIcon fontSize="small" /></IconButton></InputAdornment> : null,
              } }}
            />
            <Tooltip title="New automation">
              <IconButton onClick={onCreate} aria-label="New automation" sx={{ flex: "none", width: 40, height: 40, border: `1px solid ${tokens.divider}` }}><AddIcon /></IconButton>
            </Tooltip>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", px: 2, pb: 0.5, flex: "none" }}>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary", flex: 1 }}>
              {q ? `${matched.length} found` : `${workflows.filter((w) => w.published).length} on · ${workflows.filter((w) => !w.published).length} off`}
            </Typography>
            <TextField
              select
              size="small"
              variant="standard"
              value={sortBy}
              onChange={(e) => pickSort(e.target.value as SortBy)}
              slotProps={{ input: { disableUnderline: true, "aria-label": "Sort" } }}
              sx={{ "& .MuiSelect-select": { fontSize: 12.5, py: 0.25 } }}
            >
              {(Object.keys(SORT_LABEL) as SortBy[]).map((k) => <MenuItem key={k} value={k} sx={{ fontSize: 14 }}>Sort: {SORT_LABEL[k]}</MenuItem>)}
            </TextField>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", borderTop: `1px solid ${tokens.divider}` }}>
            <StandardSetBar agentId={agentId} workflows={workflows} />
            {matched.map(({ w, hit }) => {
              const n = waiting(w);
              const problems = problemCount(validate(w));
              const blocked = !w.published && problems > 0;
              const selected = w.id === selectedId;
              return (
                <Box key={w.id} sx={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${tokens.divider}`, bgcolor: selected ? tokens.primaryBg : "transparent", boxShadow: selected ? `inset 3px 0 0 ${tokens.primary}` : "none", opacity: paused ? 0.6 : 1 }}>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => onOpen(w.id)}
                    aria-current={selected ? "page" : undefined}
                    sx={{ flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "left", font: "inherit", color: "inherit", bgcolor: "transparent", border: 0, pl: 2, pr: 0.5, py: 1.25, minHeight: 64, cursor: "pointer", "&:hover": { bgcolor: selected ? "transparent" : tokens.hover } }}
                  >
                    <Typography sx={{ fontWeight: 500, fontSize: 14.5, lineHeight: 1.35 }}>{w.name}<ListFlags w={w} /></Typography>
                    <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                      {ago(lastRun[w.id])}{n > 0 && <Box component="span" sx={{ color: tokens.primary, fontWeight: 500 }}> · {n} waiting</Box>}
                    </Typography>
                    {hit && <Typography sx={{ fontSize: 12.5, color: "text.secondary", fontStyle: "italic", mt: 0.25, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>“{hit}”</Typography>}
                  </Box>
                  <Tooltip title={blocked ? `Open it and fix ${problems === 1 ? "1 thing" : `${problems} things`} first` : w.published ? "On" : "Off"}>
                    <Box component="span" sx={{ flex: "none", pr: 1 }}>
                      <Switch
                        checked={w.published}
                        disabled={busy === w.id || blocked}
                        onChange={(e) => void toggle(w, e.target.checked)}
                        slotProps={{ input: { "aria-label": `${w.name}: ${w.published ? "on" : "off"}` } }}
                      />
                    </Box>
                  </Tooltip>
                </Box>
              );
            })}
            {!matched.length && workflows.length > 0 && (
              <Box sx={{ textAlign: "center", py: 5, px: 2 }}>
                <Typography sx={{ color: "text.secondary" }}>Nothing has "{q}" in it.</Typography>
                <Button onClick={() => setQ("")} sx={{ mt: 1 }}>Clear search</Button>
              </Box>
            )}
          </Box>
        </>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <WaitingList agentId={agentId} />
        </Box>
      )}
    </Box>
  );
}

/** Warning icons on a list row: today's caveat, or things to fix. */
function ListFlags({ w }: { w: Workflow }) {
  const n = problemCount(validate(w));
  return (
    <>
      {n > 0 && <Tooltip title={`${n} thing${n === 1 ? "" : "s"} to fix before it can go on`}><ErrorOutlineIcon sx={{ fontSize: 16, color: tokens.red, ml: 0.75, verticalAlign: "-3px" }} /></Tooltip>}
      {w.note && <Tooltip title={w.note}><WarningAmberIcon sx={{ fontSize: 16, color: tokens.orange, ml: 0.75, verticalAlign: "-3px" }} /></Tooltip>}
    </>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────

type Selection = { kind: "trigger" } | { kind: "filters" } | { kind: "exits" } | { kind: "step"; id: string } | null;
type EditorTab = "builder" | "leads" | "history" | "settings";
const EDITOR_TABS: EditorTab[] = ["builder", "leads", "history", "settings"];

const selKey = (s: Selection) => (!s ? "" : s.kind === "step" ? s.id : s.kind);

/** Undo/redo over whole-workflow snapshots. Typing into one field within a
 *  second is one entry, so Ctrl+Z undoes a word, not a letter. The
 *  merge-or-not decision is made outside the state updater, so React's
 *  double-run of updaters in development can't change it. */
function useHistory(initial: Workflow) {
  const [state, setState] = useState({ past: [] as Workflow[], present: initial, future: [] as Workflow[] });
  const last = useRef({ key: "", at: 0 });
  const set = useCallback((fn: (w: Workflow) => Workflow, key = "") => {
    const now = Date.now();
    const merge = !!key && key === last.current.key && now - last.current.at < 1000;
    last.current = { key, at: now };
    setState((h) => {
      const next = fn(h.present);
      if (next === h.present) return h;
      return { past: merge ? h.past : [...h.past, h.present].slice(-100), present: { ...next, updatedAt: new Date().toISOString() }, future: [] };
    });
  }, []);
  const undo = useCallback(() => { last.current = { key: "", at: 0 }; setState((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h)); }, []);
  const redo = useCallback(() => { last.current = { key: "", at: 0 }; setState((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h)); }, []);
  return { wf: state.present, set, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0, dirty: state.past.length > 0 };
}

/** What Save stores: anything else (ids aside) is screen state. */
const snapshot = (w: Workflow) => JSON.stringify({ n: w.name, p: w.published, t: w.trigger, f: w.filters, s: w.steps, e: w.exits, o: w.settings, d: w.standard });

function Editor({ initial, isTemplate, backTo, onSave, onCopyToTemplates, onBack, onDelete, embedded = false }: {
  initial: Workflow;
  isTemplate: boolean;
  backTo: BackTo;
  onSave: (w: Workflow) => Promise<Workflow>;
  onCopyToTemplates?: (w: Workflow) => Promise<void>;
  onBack: () => void;
  onDelete: () => void;
  /** Beside the Automations sidebar: no back button. */
  embedded?: boolean;
}) {
  const isPhone = useMediaQuery("(max-width:599px)");
  const showSnack = useSnack();
  const { wf, set, undo, redo, canUndo, canRedo } = useHistory(initial);
  // Changed since it was opened or last saved. A new workflow can be saved as
  // it is, but leaving it untouched just drops it, no questions.
  const [savedSnap, setSavedSnap] = useState(() => snapshot(initial));
  const [savedWf, setSavedWf] = useState(initial);
  const dirty = snapshot(wf) !== savedSnap;
  const canSave = dirty || !isSaved(initial.id);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => rememberTags(tagsIn(wf.steps)), [wf.steps]);
  // Refreshing or closing the tab with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  // …and so does opening another one from the sidebar.
  useEffect(() => {
    editorDirty = dirty;
    return () => { editorDirty = false; };
  }, [dirty]);

  // The tab, the lead being shown (?run=) and the step the Leads tab is
  // narrowed to (?step=) live in the address, so a refresh or a shared
  // link opens the same view. Tab switches replace the entry: Back leaves
  // the workflow rather than stepping through its tabs.
  const [params, setParams] = useSearchParams();
  // Keeps the history state (a new workflow's draft, where Back goes).
  const navState = useLocation().state as unknown;
  const asked = params.get("tab") as EditorTab | null;
  const tab: EditorTab = asked && EDITOR_TABS.includes(asked) && !(isTemplate && asked === "leads") ? asked : "builder";
  const runId = params.get("run");
  const stepFilter = params.get("step");
  const setView = useCallback((v: { tab?: EditorTab; run?: string | null; step?: string | null }) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (v.tab) { if (v.tab === "builder") n.delete("tab"); else n.set("tab", v.tab); }
      if (v.run !== undefined) { if (v.run) n.set("run", v.run); else n.delete("run"); }
      if (v.step !== undefined) { if (v.step) n.set("step", v.step); else n.delete("step"); }
      return n;
    }, { replace: true, state: navState });
  }, [setParams, navState]);
  const setTab = (t: EditorTab) => setView({ tab: t });

  // Leads in this workflow now, and the step each is at. Positions refer to
  // the workflow as saved, so they're read against the saved steps.
  const [savedSteps, setSavedSteps] = useState(initial.steps);
  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ["workflowRuns", initial.id],
    queryFn: () => listWorkflowRuns(initial.id),
    enabled: !isTemplate && isSaved(initial.id),
    refetchInterval: 30_000,
  });
  const runStep = useCallback((r: LeadInWorkflow) => stepAtPos(savedSteps, r.pos), [savedSteps]);
  const here = useMemo(() => {
    const n: Record<string, number> = {};
    for (const r of runs) { const st = runStep(r); if (st) n[st.id] = (n[st.id] ?? 0) + 1; }
    return n;
  }, [runs, runStep]);
  const focusRun = runId ? runs.find((r) => r.id === runId) : undefined;
  const focusStep = focusRun ? runStep(focusRun) : undefined;
  const [sel, setSel] = useState<Selection>(null);
  const [editingName, setEditingName] = useState(false);
  const problems = useMemo(() => validate(wf), [wf]);
  const nProblems = problemCount(problems);

  const update = (patch: Partial<Workflow>, key?: string) => set((w) => ({ ...w, ...patch }), key);
  const editStep = (id: string, patch: Partial<Step>, key?: string) => set((w) => ({ ...w, steps: updateStep(w.steps, id, patch) }), key ? `${id}:${key}` : "");
  const deleteStep = (id: string) => { set((w) => ({ ...w, steps: removeStep(w.steps, id) })); setSel(null); };
  const addStep = (path: Path, index: number, type: StepType) => {
    const s = newStep(type);
    set((w) => ({ ...w, steps: insertStep(w.steps, path, index, s) }));
    setSel({ kind: "step", id: s.id });
  };
  const shiftStep = (id: string, dir: -1 | 1) => set((w) => ({ ...w, steps: moveStep(w.steps, id, dir) }));

  async function save() {
    if (wf.published && nProblems) {
      showSnack(`Fix ${nProblems} thing${nProblems === 1 ? "" : "s"} first, or switch it off`);
      goToFirstProblem();
      return;
    }
    setSaving(true);
    try {
      await onSave(wf);
      setSavedSnap(snapshot(wf));
      setSavedWf(wf);
      setSavedSteps(wf.steps);
      showSnack(isTemplate ? "Template saved" : wf.published ? "Saved. It's on: new leads go through it from now." : "Saved. It's off.");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const back = () => (dirty ? setLeaving(true) : onBack());

  function goToFirstProblem() {
    setTab("builder");
    if (problems.workflow && !wf.name.trim()) { setEditingName(true); return; }
    if (problems.trigger) { setSel({ kind: "trigger" }); return; }
    if (problems.filters) { setSel({ kind: "filters" }); return; }
    const id = Object.keys(problems).find((k) => !["workflow", "trigger", "filters"].includes(k));
    if (id) setSel({ kind: "step", id });
  }

  // Keyboard: Esc closes the panel, Ctrl/Cmd+Z undoes, Shift+Z or Y redoes.
  // Skipped while typing (the field's own undo works) and inside open menus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      const inMenu = !!el?.closest?.('[role="menu"], [role="listbox"], [role="dialog"]');
      if (e.key === "Escape" && !typing && !inMenu) setSel(null);
      if (typing || inMenu || !(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z") { e.preventDefault(); (e.shiftKey ? redo : undo)(); }
      if (k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const selectedStep = sel?.kind === "step" ? findStep(wf.steps, sel.id) : undefined;
  const panelOpen = tab === "builder" && !!sel && (sel.kind !== "step" || !!selectedStep);
  const panelTitle = sel?.kind === "trigger" ? "Trigger" : sel?.kind === "filters" ? "Only run if" : sel?.kind === "exits" ? "Stop early when" : selectedStep ? stepTitle(selectedStep) : "";
  const panelProblems = sel ? problems[sel.kind === "step" ? sel.id : sel.kind] ?? [] : [];
  const position = selectedStep ? locate(wf.steps, selectedStep.id) : null;

  const panel = panelOpen && (
    <DetailsPanel
      key={selKey(sel)}
      title={panelTitle}
      problems={panelProblems}
      onClose={() => setSel(null)}
      onDelete={selectedStep ? () => deleteStep(selectedStep.id) : undefined}
      deleteLabel={selectedStep?.type === "branch" ? "Delete check and its paths" : "Delete step"}
      onMove={position && position.length > 1 ? (dir) => shiftStep(selectedStep!.id, dir) : undefined}
      canMoveUp={!!position && position.index > 0}
      canMoveDown={!!position && position.index < position.length - 1}
    >
      <NodePreview sel={sel} wf={wf} step={selectedStep} />
      {sel?.kind === "trigger" && <TriggerEditor t={wf.trigger} onChange={(trigger) => update({ trigger }, "trigger")} />}
      {sel?.kind === "filters" && <FiltersEditor filters={wf.filters} onChange={(filters) => update({ filters }, "filters")} />}
      {sel?.kind === "exits" && <ExitsEditor exits={wf.exits} onChange={(exits) => update({ exits })} />}
      {selectedStep && <StepEditor step={selectedStep} trigger={wf.trigger} onChange={(p, key) => editStep(selectedStep.id, p, key)} />}
    </DetailsPanel>
  );

  const finishName = () => {
    setEditingName(false);
    if (!wf.name.trim()) update({ name: "Untitled workflow" });
  };
  // Back to how it was last saved; a new one that was never saved just closes.
  const discard = () => {
    if (!isSaved(initial.id)) { onBack(); return; }
    set(() => savedWf);
    setSel(null);
  };
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const pick = (fn: () => void) => () => { setMenu(null); fn(); };
  const status = [
    isTemplate ? "Template" : wf.published ? "On" : "Off",
    !isTemplate && runs.length ? `${runs.length} lead${runs.length === 1 ? "" : "s"} in it` : "",
  ].filter(Boolean).join(" · ");
  const dialogTitle = tab === "leads" ? "Who's in it now" : tab === "history" ? "History" : "Settings";

  return (
    // A fixed-height frame: the header never scrolls away; the steps scroll
    // down under it. Its two rows line up with the sidebar's title and tabs.
    <Box sx={{ height: "calc(100dvh - var(--ek-nav-h))", display: "flex", flexDirection: "column", minHeight: 420 }}>
      <Box sx={{ flex: "none", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, height: 64, pl: embedded ? 2 : 0.5, pr: 1 }}>
          {!embedded && <IconButton onClick={back} aria-label={`Back to ${backTo.label.toLowerCase()}`} sx={{ flex: "none" }}><ArrowBackIcon /></IconButton>}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <InputBase
                autoFocus
                value={wf.name}
                onChange={(e) => update({ name: e.target.value }, "name")}
                onBlur={finishName}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLElement).blur(); }}
                inputProps={{ "aria-label": "Automation name", maxLength: 80 }}
                sx={{ fontWeight: 600, fontSize: 18, width: "100%", borderBottom: "2px solid", borderColor: "primary.main" }}
              />
            ) : (
              <Tooltip title="Rename" placement="bottom-start">
                <Typography component="button" type="button" onClick={() => setEditingName(true)} noWrap sx={{ display: "block", maxWidth: "100%", font: "inherit", fontSize: 18, fontWeight: 600, color: "inherit", bgcolor: "transparent", border: 0, p: 0, cursor: "text", textAlign: "left", "&:hover": { textDecoration: "underline", textDecorationColor: tokens.line } }}>
                  {wf.name}
                </Typography>
              </Tooltip>
            )}
            <Typography noWrap sx={{ fontSize: 12.5, color: wf.published ? "text.secondary" : tokens.ink3 }}>{status}</Typography>
          </Box>
          <IconButton onClick={(e) => setMenu(e.currentTarget)} aria-label="More" sx={{ flex: "none" }}><MoreVertIcon /></IconButton>
          <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
            {!isTemplate && <MenuItem onClick={pick(() => setTab("leads"))}><ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>Who's in it{runs.length ? ` (${runs.length})` : ""}</MenuItem>}
            <MenuItem onClick={pick(() => setTab("history"))}><ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>History</MenuItem>
            <MenuItem onClick={pick(() => setTab("settings"))}><ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>Settings</MenuItem>
            <Divider />
            <MenuItem disabled={!canUndo} onClick={pick(undo)}><ListItemIcon><UndoIcon fontSize="small" /></ListItemIcon>Undo</MenuItem>
            <MenuItem disabled={!canRedo} onClick={pick(redo)}><ListItemIcon><RedoIcon fontSize="small" /></ListItemIcon>Redo</MenuItem>
          </Menu>
        </Box>
        {/* Same height as the sidebar's tabs, so the two dividers meet. */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, height: 44, px: 2 }}>
          {nProblems > 0 ? (
            <Chip size="small" color="error" variant="outlined" icon={<ErrorOutlineIcon />} label={`${nProblems} to fix · show me`} onClick={goToFirstProblem} />
          ) : (
            <Typography noWrap sx={{ fontSize: 13, color: "text.secondary", flex: 1, minWidth: 0 }}>
              {canSave ? "You have changes that aren't saved yet." : "Tap a step to change it."}
            </Typography>
          )}
          <Box sx={{ flex: nProblems > 0 ? 1 : "none" }} />
          {canSave && (
            <>
              <Button onClick={discard} disabled={saving} sx={{ flex: "none" }}>Discard</Button>
              <Button variant="contained" onClick={() => void save()} disabled={saving} sx={{ flex: "none" }}>{saving ? "Saving…" : "Save"}</Button>
            </>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
        <Canvas
          wf={wf}
          sel={sel}
          setSel={setSel}
          onAdd={addStep}
          problems={problems}
          here={here}
          onHere={(stepId) => setView({ tab: "leads", step: stepId, run: null })}
          highlight={focusStep?.id ?? null}
          details={(s) => (sel && selKey(sel) === selKey(s) ? panel : null)}
          banner={runId ? (
            <LeadBanner
              run={focusRun}
              step={focusStep}
              loading={runsLoading}
              onClose={() => setView({ run: null })}
              onHistory={() => setView({ tab: "history", run: null })}
            />
          ) : null}
        />
      </Box>

      {/* Who's in it, History and Settings: one tap from the ⋮ menu, over the steps. */}
      <Dialog open={tab !== "builder"} onClose={() => setTab("builder")} fullWidth maxWidth="md" fullScreen={isPhone} slotProps={{ paper: { sx: { height: isPhone ? "100%" : "80dvh" } } }}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>{dialogTitle}</Box>
          <IconButton aria-label="Close" onClick={() => setTab("builder")}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, display: "flex", minHeight: 0 }}>
          {tab === "settings" && <SettingsTab wf={wf} isTemplate={isTemplate} onChange={update} onDelete={onDelete} onCopyToTemplates={onCopyToTemplates ? () => void onCopyToTemplates(wf) : undefined} />}
          {tab === "leads" && (
            <LeadsTab
              runs={runs}
              loading={runsLoading}
              saved={isSaved(initial.id)}
              published={initial.published}
              stepOf={runStep}
              stepFilter={stepFilter ? findStep(savedSteps, stepFilter) ?? null : null}
              onClearStep={() => setView({ step: null })}
              onShow={(id) => setView({ tab: "builder", run: id, step: null })}
            />
          )}
          {tab === "history" && <HistoryTab wf={wf} />}
        </DialogContent>
        {tab === "settings" && canSave && (
          <DialogActions>
            <Button onClick={() => setTab("builder")}>Done</Button>
            <Button variant="contained" onClick={() => { void save(); setTab("builder"); }} disabled={saving}>Save</Button>
          </DialogActions>
        )}
      </Dialog>
      <Dialog open={leaving} onClose={() => setLeaving(false)}>
        <DialogTitle>Leave without saving?</DialogTitle>
        <DialogContent><Typography sx={{ fontSize: 14 }}>Your changes to "{wf.name}" will be lost.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaving(false)}>Keep editing</Button>
          <Button color="error" onClick={() => { setLeaving(false); onBack(); }}>Leave</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** A step's editor, opened right under the step: title, move and close on
 *  top, Delete and Done at the foot. Keyed by what's selected, so a
 *  half-confirmed delete never carries over to another step. */
function DetailsPanel({ title, problems, onClose, onDelete, deleteLabel, onMove, canMoveUp, canMoveDown, children }: {
  title: string; problems: string[]; onClose: () => void; onDelete?: () => void; deleteLabel: string;
  onMove?: (dir: -1 | 1) => void; canMoveUp: boolean; canMoveDown: boolean; children: React.ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Box sx={{ width: "100%", mt: 1, bgcolor: "background.paper", border: `1px solid ${tokens.primary}`, borderRadius: "8px", boxShadow: `0 2px 8px ${tokens.shadow}`, textAlign: "left" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, pl: 2, pr: 1, height: 48, borderBottom: `1px solid ${tokens.divider}` }}>
        <Typography sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>{title}</Typography>
        {onMove && (
          <>
            <Tooltip title="Move up"><span><IconButton size="small" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Move step up"><ArrowUpwardIcon fontSize="small" /></IconButton></span></Tooltip>
            <Tooltip title="Move down"><span><IconButton size="small" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Move step down"><ArrowDownwardIcon fontSize="small" /></IconButton></span></Tooltip>
          </>
        )}
        <IconButton onClick={onClose} aria-label="Close" size="small"><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
        {problems.length > 0 && (
          <Alert severity="error" sx={{ py: 0.5 }}>
            {problems.length === 1 ? problems[0] : <Box component="ul" sx={{ m: 0, pl: 2 }}>{problems.map((p) => <li key={p}>{p}</li>)}</Box>}
          </Alert>
        )}
        {children}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.25, borderTop: `1px solid ${tokens.divider}` }}>
        {onDelete && (confirming ? (
          <>
            <Typography sx={{ fontSize: 13, flex: 1 }}>{deleteLabel.startsWith("Delete check") ? "Delete this check and everything under it?" : "Delete this step?"}</Typography>
            <Button size="small" onClick={() => setConfirming(false)}>Keep</Button>
            <Button size="small" color="error" variant="contained" onClick={onDelete}>Delete</Button>
          </>
        ) : (
          <Button color="error" startIcon={<DeleteOutlinedIcon />} onClick={() => setConfirming(true)} sx={{ textTransform: "none" }}>{deleteLabel}</Button>
        ))}
        {!confirming && <><Box sx={{ flex: 1 }} /><Button variant="contained" onClick={onClose}>Done</Button></>}
      </Box>
    </Box>
  );
}

// ── Steps, top to bottom ─────────────────────────────────────────────────

/** The automation as one column that only scrolls down: trigger, filters,
 *  steps (an if/else's Yes and No paths stacked, each on a rail), stop
 *  rules. A step's editor opens right under it, not in a side panel. */
function Canvas({ wf, sel, setSel, onAdd, problems, here, onHere, highlight, banner, details }: {
  wf: Workflow; sel: Selection; setSel: (s: Selection) => void; onAdd: (path: Path, index: number, t: StepType) => void; problems: Problems;
  /** Leads waiting at each step (by step id), and what clicking the count does. */
  here: Record<string, number>; onHere: (stepId: string) => void;
  /** The step of the lead being shown (?run=), and the strip saying so. */
  highlight: string | null; banner: React.ReactNode;
  /** The editor for what's selected, drawn under it. */
  details: (s: NonNullable<Selection>) => React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const exitsOn = wf.exits.filter((x) => x.on);
  const allowed = allowedSteps(wf.trigger);
  const ctx: StepCtx = { sel, setSel, onAdd, problems, allowed, here, onHere, highlight, details };

  // Bring the shown lead's step, or a step just opened, into view. Scrolls
  // this column only: scrollIntoView would also move the page around it.
  const focus = highlight ? `step:${highlight}` : sel ? (sel.kind === "step" ? `step:${sel.id}` : sel.kind) : null;
  useEffect(() => {
    const box = scroller.current;
    if (!box || !focus) return;
    const el = box.querySelector<HTMLElement>(`[data-sel="${CSS.escape(focus)}"]`);
    if (!el) return;
    const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.top >= b.top + 8 && r.bottom <= b.bottom - 8) return;
    box.scrollTo({ top: box.scrollTop + r.top - b.top - 16, behavior: "smooth" });
  }, [focus]);

  return (
    <Box ref={scroller} sx={{ flex: 1, minWidth: 0, overflowY: "auto", overflowX: "hidden", bgcolor: tokens.bg }}>
      {banner}
      {wf.note && (
        <Box sx={{ position: "sticky", top: 0, zIndex: 2, display: "flex", gap: 1, alignItems: "flex-start", bgcolor: tokens.amberTint, borderBottom: `1px solid ${tokens.amberBorder}`, px: 2, py: 1 }}>
          <WarningAmberIcon sx={{ fontSize: 18, color: tokens.amber, mt: "2px" }} />
          <Typography sx={{ fontSize: 13 }}>{wf.note}</Typography>
        </Box>
      )}
      <Box sx={{ maxWidth: 640, mx: "auto", px: 2, py: 3, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Box data-sel="trigger" sx={{ width: "100%" }}>
          <Node color="#1565c0" icon={<BoltIcon />} title="Trigger" text={triggerSummary(wf.trigger)} selected={sel?.kind === "trigger"} error={!!problems.trigger} onClick={() => setSel(sel?.kind === "trigger" ? null : { kind: "trigger" })} />
          {details({ kind: "trigger" })}
        </Box>
        <Line />
        <Box data-sel="filters" sx={{ width: "100%" }}>
          <Node
            color="#546e7a"
            icon={<FilterAltIcon />}
            title="Only if"
            text={wf.filters.length ? wf.filters.map(filterSummary).join(" · ") : "Every lead (no filters)"}
            selected={sel?.kind === "filters"}
            error={!!problems.filters}
            onClick={() => setSel(sel?.kind === "filters" ? null : { kind: "filters" })}
            dashed={!wf.filters.length}
          />
          {details({ kind: "filters" })}
        </Box>
        <StepList steps={wf.steps} path="root" ctx={ctx} />
        <Line />
        <Box data-sel="exits" sx={{ width: "100%" }}>
          <Node
            color="#b71c1c"
            icon={<BlockIcon />}
            title="Stop early when"
            text={exitsOn.length ? exitsOn.map((x) => EXITS.find((e) => e.kind === x.kind)?.label.replace(/ \(.*\)$/, "")).join(" · ") : "Nothing: every step always runs"}
            selected={sel?.kind === "exits"}
            onClick={() => setSel(sel?.kind === "exits" ? null : { kind: "exits" })}
            dashed={!exitsOn.length}
          />
          {details({ kind: "exits" })}
        </Box>
        <Line />
        <Box sx={{ px: 1.5, py: 0.5, borderRadius: "999px", bgcolor: "#37474f", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: ".08em" }}>END</Box>
        <Timeline wf={wf} />
      </Box>
    </Box>
  );
}

interface StepCtx {
  sel: Selection;
  setSel: (s: Selection) => void;
  onAdd: (path: Path, index: number, t: StepType) => void;
  problems: Problems;
  allowed: StepType[];
  here: Record<string, number>;
  onHere: (stepId: string) => void;
  highlight: string | null;
  details: (s: NonNullable<Selection>) => React.ReactNode;
}

function Line({ h = 24 }: { h?: number }) {
  return <Box sx={{ width: 2, height: h, bgcolor: tokens.line, flex: "none" }} />;
}

function Node({ color, icon, title, text, selected, onClick, dashed, error, stepId, count = 0, onCount, highlight }: {
  color: string; icon: React.ReactNode; title: string; text: string; selected: boolean; onClick: () => void; dashed?: boolean; error?: boolean;
  /** Steps only: leads waiting here, and the lead being shown is here. */
  stepId?: string; count?: number; onCount?: () => void; highlight?: boolean;
}) {
  const edge = error ? tokens.red : highlight ? tokens.amber : selected ? tokens.primary : tokens.divider;
  const ring = highlight ? tokens.amber : error ? tokens.red : tokens.primary;
  return (
    <Box data-step={stepId} sx={{ position: "relative", flex: "none" }}>
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={`${title}: ${text}${error ? " (needs fixing)" : ""}`}
      sx={{
        width: "100%", display: "flex", gap: 1.25, alignItems: "center", textAlign: "left", font: "inherit", color: "inherit",
        bgcolor: "background.paper", borderRadius: "8px", p: 1.25, cursor: "pointer", flex: "none", position: "relative",
        border: `${highlight ? 2 : 1}px ${dashed && !error ? "dashed" : "solid"} ${edge}`,
        boxShadow: selected || highlight ? `0 0 0 3px color-mix(in srgb, ${ring} 30%, transparent)` : `0 1px 2px ${tokens.shadow}`,
        transition: "box-shadow .12s, border-color .12s",
        "&:hover": { borderColor: error ? tokens.red : selected ? tokens.primary : tokens.ink3 },
        "&:focus-visible": { outline: "none", boxShadow: `0 0 0 3px color-mix(in srgb, ${tokens.primary} 50%, transparent)` },
      }}
    >
      <Box sx={{ width: 32, height: 32, flex: "none", borderRadius: "6px", bgcolor: color, color: "#fff", display: "grid", placeItems: "center", "& svg": { fontSize: 18 } }}>{icon}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "text.secondary" }}>{title}</Typography>
        <Typography sx={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</Typography>
      </Box>
      {error && <ErrorOutlineIcon sx={{ fontSize: 18, color: tokens.red, flex: "none" }} />}
    </Box>
    {count > 0 && (
      <Tooltip title={`${count} lead${count === 1 ? "" : "s"} waiting for this step. Show them`}>
        <Box
          component="button"
          type="button"
          onClick={onCount}
          aria-label={`${count} lead${count === 1 ? "" : "s"} waiting for this step`}
          sx={{
            position: "absolute", top: -9, right: -9, minWidth: 22, height: 22, px: 0.75, borderRadius: "11px", border: `2px solid ${tokens.bg}`,
            bgcolor: "primary.main", color: "primary.contrastText", font: "inherit", fontSize: 11.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 0.25,
            "&:hover, &:focus-visible": { outline: "none", filter: "brightness(1.1)" },
          }}
        >
          <PersonIcon sx={{ fontSize: 13 }} />{count}
        </Box>
      </Tooltip>
    )}
    </Box>
  );
}

function AddButton({ onPick, allowed }: { onPick: (t: StepType) => void; allowed: StepType[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Line h={14} />
      <Tooltip title="Add a step here">
        <IconButton
          size="small"
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label="Add a step here"
          sx={{ width: 26, height: 26, flex: "none", border: `1px solid ${tokens.line}`, bgcolor: "background.paper", "&:hover": { bgcolor: "primary.main", color: "primary.contrastText", borderColor: "primary.main" } }}
        >
          <AddIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Line h={14} />
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {STEP_TYPES.filter((t) => allowed.includes(t.type)).map((t) => (
          <MenuItem key={t.type} onClick={() => { setAnchor(null); onPick(t.type); }} sx={{ gap: 1.5, minWidth: 250, py: 1 }}>
            <Box sx={{ width: 28, height: 28, borderRadius: "6px", bgcolor: STEP_COLOR[t.type], color: "#fff", display: "grid", placeItems: "center", "& svg": { fontSize: 16 } }}>{STEP_ICON[t.type]}</Box>
            <Box>
              <Typography sx={{ fontSize: 14 }}>{t.label}</Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{t.help}</Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** A column of steps. Between every pair (and at both ends) sits an add
 *  button on the line, so a step can go anywhere. */
function StepList({ steps, path, ctx }: { steps: Step[]; path: Path; ctx: StepCtx }) {
  return (
    <>
      <AddButton onPick={(t) => ctx.onAdd(path, 0, t)} allowed={ctx.allowed} />
      {steps.map((s, i) => {
        const open = ctx.sel?.kind === "step" && ctx.sel.id === s.id;
        return (
          <Box key={s.id} sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
            <Box data-sel={`step:${s.id}`} sx={{ width: "100%" }}>
              <Node
                color={STEP_COLOR[s.type]}
                icon={STEP_ICON[s.type]}
                title={stepTitle(s)}
                text={stepSummary(s)}
                selected={open}
                error={!!ctx.problems[s.id]}
                onClick={() => ctx.setSel(open ? null : { kind: "step", id: s.id })}
                stepId={s.id}
                count={ctx.here[s.id]}
                onCount={() => ctx.onHere(s.id)}
                highlight={ctx.highlight === s.id}
              />
              {ctx.details({ kind: "step", id: s.id })}
            </Box>
            {s.type === "branch" && <BranchPaths step={s} ctx={ctx} />}
            <AddButton onPick={(t) => ctx.onAdd(path, i + 1, t)} allowed={ctx.allowed} />
          </Box>
        );
      })}
    </>
  );
}

/** An if/else's two paths, Yes above No, each marked by a rail. */
function BranchPaths({ step, ctx }: { step: Extract<Step, { type: "branch" }>; ctx: StepCtx }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", width: "100%" }}>
      {(["yes", "no"] as const).map((side) => (
        <Box key={side} sx={{ display: "flex", flexDirection: "column", alignItems: "center", borderLeft: `3px solid ${side === "yes" ? tokens.green : tokens.outline}`, pl: 2, ml: 1, mt: 1.5 }}>
          <LaneLabel side={side} />
          <StepList steps={step[side]} path={`${step.id}:${side}`} ctx={ctx} />
        </Box>
      ))}
    </Box>
  );
}

function LaneLabel({ side }: { side: "yes" | "no" }) {
  return (
    <Box sx={{ px: 1.25, py: 0.25, borderRadius: "999px", fontSize: 12, fontWeight: 600, flex: "none", bgcolor: side === "yes" ? tokens.greenTint : tokens.surface2, color: side === "yes" ? tokens.greenDark : tokens.ink2, border: `1px solid ${side === "yes" ? tokens.greenBorder : tokens.divider}` }}>
      {side === "yes" ? "Yes" : "No"}
    </Box>
  );
}

/** "How this plays out": the main path laid out in time, so the delays make sense at a glance. */
function Timeline({ wf }: { wf: Workflow }) {
  const rows = useMemo(() => timeline(wf), [wf]);
  if (!rows.length) return null;
  return (
    <Box sx={{ width: "100%", mt: 4, bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", p: 1.5 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "text.secondary", mb: 1 }}>How this plays out for one lead</Typography>
      {rows.map((r, i) => (
        <Box key={i} sx={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 1, fontSize: 13, py: 0.5, borderTop: i ? `1px solid ${tokens.divider2}` : 0 }}>
          <Box sx={{ color: "text.secondary", fontWeight: 500 }}>{timeLabel(r.atMinutes)}</Box>
          <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.what}</Box>
        </Box>
      ))}
      <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>
        {wf.settings.quietHours ? "Messages due between 20:00 and 08:00 wait until 08:00. " : ""}
        {wf.exits.some((x) => x.on) ? "Ends early if a stop rule happens." : "Nothing ends it early."}
      </Typography>
    </Box>
  );
}

// ── Leads in the workflow ────────────────────────────────────────────────

/** When a lead's next step happens, in words: "In 2 days · Tue 7 Oct, 10:00". */
function nextLabel(r: LeadInWorkflow): { rel: string; at: string } {
  if (r.status === "paused") return { rel: "Paused", at: "" };
  if (r.status === "processing") return { rel: "Happening now", at: "" };
  const t = Date.parse(r.run_at);
  const mins = Math.round((t - Date.now()) / 60_000);
  const rel = mins <= 1 ? "Within a minute" : mins < 60 ? `In ${mins} min` : mins < 48 * 60 ? `In ${Math.round(mins / 60)}h` : `In ${Math.round(mins / 1440)} days`;
  return { rel, at: when(new Date(t)) };
}

function stepLine(step: Step | undefined): string {
  return step ? `${stepTitle(step)}: ${stepSummary(step)}` : "Finishing";
}

/** The strip over the canvas when a lead is being shown (?run=). */
function LeadBanner({ run, step, loading, onClose, onHistory }: { run: LeadInWorkflow | undefined; step: Step | undefined; loading: boolean; onClose: () => void; onHistory: () => void }) {
  const next = run ? nextLabel(run) : null;
  return (
    <Box sx={{ position: "sticky", top: 0, left: 0, zIndex: 3, display: "flex", flexWrap: { xs: "wrap", sm: "nowrap" }, gap: { xs: 0.5, sm: 1.25 }, alignItems: "center", bgcolor: tokens.amberTint, borderBottom: `1px solid ${tokens.amberBorder}`, px: 2, py: 1 }}>
      <PersonIcon sx={{ fontSize: 20, color: tokens.amber, flex: "none", display: { xs: "none", sm: "block" } }} />
      <Box sx={{ flex: { xs: "1 1 100%", sm: 1 }, minWidth: 0, order: { xs: 0, sm: 0 } }}>
        {loading ? (
          <Typography sx={{ fontSize: 13.5 }}>Finding this lead…</Typography>
        ) : run ? (
          <>
            <Typography sx={{ fontSize: 13.5 }}>
              <b>{run.lead?.name ?? "Daily summary"}</b> is here. Next: <b>{step ? stepTitle(step) : "the end"}</b>
              {next && <> · {next.rel}{next.at ? ` (${next.at})` : ""}</>}
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Highlighted below. Steps above it are done.</Typography>
          </>
        ) : (
          <Typography sx={{ fontSize: 13.5 }}>
            This lead isn't in the workflow any more (it finished or was stopped).{" "}
            <Box component="button" type="button" onClick={onHistory} sx={{ font: "inherit", color: "primary.main", bgcolor: "transparent", border: 0, p: 0, cursor: "pointer", textDecoration: "underline" }}>See what happened</Box>
          </Typography>
        )}
      </Box>
      {run?.lead && <Button size="small" component={RouterLink} to={`/leads/${run.lead.id}`} sx={{ flex: "none" }}>Open lead</Button>}
      <IconButton size="small" onClick={onClose} aria-label="Stop showing this lead"><CloseIcon fontSize="small" /></IconButton>
    </Box>
  );
}

const LEADS_KEYS = ["lead", "step", "next"] as const;
type LeadsKey = (typeof LEADS_KEYS)[number];

/** Who is in this workflow right now and where: one row per lead. Click a
 *  row to see their place on the canvas. */
function LeadsTab({ runs, loading, saved, published, stepOf, stepFilter, onClearStep, onShow }: {
  runs: LeadInWorkflow[]; loading: boolean; saved: boolean; published: boolean;
  stepOf: (r: LeadInWorkflow) => Step | undefined; stepFilter: Step | null; onClearStep: () => void; onShow: (runId: string) => void;
}) {
  const isDesktop = useMediaQuery("(min-width:900px)");
  const [q, setQ] = useState("");
  const { sort, onSort } = useTableSort<LeadsKey>("estatekit_workflow_leads_sort", { k: "next", dir: "asc" }, LEADS_KEYS);
  const rows = runs.map((r) => {
    const step = stepOf(r);
    return { r, step, lead: r.lead?.name ?? "Daily summary", where: stepLine(step), next: nextLabel(r) };
  });
  const needle = q.trim().toLowerCase();
  const shown = sortRows(
    rows.filter((x) => (!stepFilter || x.step?.id === stepFilter.id) && (!needle || `${x.lead} ${x.where}`.toLowerCase().includes(needle))),
    (x) => (sort.k === "lead" ? x.lead : sort.k === "step" ? x.where : x.r.status === "paused" ? Infinity : Date.parse(x.r.run_at)),
    sort.dir,
  );
  const empty = !saved ? "Save the workflow first." : loading ? "Loading…" : rows.length ? "Nothing matches." : published ? "No leads in it right now. New ones join when the trigger happens." : "No leads in it. It's off, so nobody new joins.";
  return (
    <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
      <Box sx={{ maxWidth: 1000, mx: "auto" }}>
        <Typography component="div" sx={{ fontSize: 13.5, color: "text.secondary", mb: 2 }}>
          Leads going through this workflow now and the step each one does next. Click one to see it on the workflow. Finished leads are in History.
        </Typography>
        <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
          <TextField size="small" placeholder="Find a lead" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: 1, minWidth: 180 }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          {stepFilter && <Chip label={`Waiting for: ${stepTitle(stepFilter)}`} onDelete={onClearStep} />}
        </Box>
        <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", overflow: "hidden" }}>
          {isDesktop ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <SortHead k="lead" label="Lead" sort={sort} onSort={onSort} />
                  <SortHead k="step" label="Next step" sort={sort} onSort={onSort} />
                  <SortHead k="next" label="When (SAST)" sort={sort} onSort={onSort} />
                  <PlainHead sx={{ width: 48 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((x) => (
                  <TableRow key={x.r.id} hover onClick={() => onShow(x.r.id)} sx={{ cursor: "pointer", "&:last-child td": { borderBottom: 0 }, "& td": { py: 1.25 } }}>
                    <TableCell sx={{ fontWeight: 500, fontSize: 14 }}>{x.lead}</TableCell>
                    <TableCell sx={{ fontSize: 13, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.where}</TableCell>
                    <TableCell sx={{ fontSize: 13 }}>
                      <Box sx={{ fontWeight: 500, color: x.r.status === "paused" ? "text.secondary" : "primary.main" }}>{x.next.rel}</Box>
                      {x.next.at && <Box sx={{ fontSize: 12, color: "text.secondary" }}>{x.next.at}</Box>}
                    </TableCell>
                    <TableCell padding="checkbox"><ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            shown.map((x, i) => (
              <Box
                key={x.r.id}
                component="button"
                type="button"
                onClick={() => onShow(x.r.id)}
                sx={{ display: "block", width: "100%", textAlign: "left", font: "inherit", color: "inherit", bgcolor: "transparent", border: 0, borderTop: i ? `1px solid ${tokens.divider}` : 0, p: "12px 14px", cursor: "pointer" }}
              >
                <Typography sx={{ fontWeight: 500, fontSize: 14.5 }}>{x.lead}</Typography>
                <Typography sx={{ fontSize: 12.5 }}>{x.where}</Typography>
                <Typography sx={{ fontSize: 12.5, color: x.r.status === "paused" ? "text.secondary" : "primary.main" }}>{x.next.rel}{x.next.at ? ` · ${x.next.at}` : ""}</Typography>
              </Box>
            ))
          )}
          {!shown.length && <Typography sx={{ color: "text.secondary", textAlign: "center", py: 6, px: 2 }}>{empty}</Typography>}
        </Box>
      </Box>
    </Box>
  );
}

// ── Settings / history tabs ──────────────────────────────────────────────

function SettingRow({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 1.5, borderTop: `1px solid ${tokens.divider2}`, "&:first-of-type": { borderTop: 0 } }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{title}</Typography>
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{help}</Typography>
      </Box>
      {children}
    </Box>
  );
}

function SettingsTab({ wf, isTemplate, onChange, onDelete, onCopyToTemplates }: { wf: Workflow; isTemplate: boolean; onChange: (p: Partial<Workflow>, key?: string) => void; onDelete: () => void; onCopyToTemplates?: () => void }) {
  const s = wf.settings;
  const setS = (p: Partial<Settings>) => onChange({ settings: { ...s, ...p } });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const card = { bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", p: 2 };
  return (
    <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
      <Box sx={{ maxWidth: 720, mx: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        <Box sx={card}>
          <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Sending</Typography>
          <SettingRow title="Quiet hours" help="Messages due between 20:00 and 08:00 (SAST) wait until 08:00. Leave off for new-lead alerts, which should go straight away.">
            <Switch checked={s.quietHours} onChange={(e) => setS({ quietHours: e.target.checked })} slotProps={{ input: { "aria-label": "Quiet hours" } }} />
          </SettingRow>
          <SettingRow title="Allow the same lead in again" help="Off: a lead goes through this workflow once. On: every time the trigger happens.">
            <Switch checked={s.reEnter} onChange={(e) => setS({ reEnter: e.target.checked })} slotProps={{ input: { "aria-label": "Allow the same lead in again" } }} />
          </SettingRow>
        </Box>
        {isTemplate && (
          <Box sx={card}>
            <SettingRow title="New accounts get this" help="Every new account starts with a copy of these. Changing this doesn't touch accounts that already have one.">
              <TextField select size="small" value={wf.standard ?? "no"} onChange={(e) => onChange({ standard: e.target.value as Workflow["standard"] })} sx={{ minWidth: 170 }} slotProps={{ htmlInput: { "aria-label": "New accounts get this" } }}>
                <MenuItem value="no">No</MenuItem>
                <MenuItem value="on">Yes, switched on</MenuItem>
                <MenuItem value="off">Yes, switched off</MenuItem>
              </TextField>
            </SettingRow>
          </Box>
        )}
        <Box sx={{ ...card, display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography sx={{ fontWeight: 600 }}>Stop early when</Typography>
          <ExitsEditor exits={wf.exits} onChange={(exits) => onChange({ exits })} />
        </Box>
        {onCopyToTemplates && (
          <Box sx={{ ...card, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography sx={{ fontWeight: 600 }}>Save a copy to Templates</Typography>
              <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>So other accounts can start from it. This workflow isn't changed.</Typography>
            </Box>
            <Button variant="outlined" onClick={onCopyToTemplates}>Copy to Templates</Button>
          </Box>
        )}
        <Box sx={{ ...card, borderColor: tokens.redBorder, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography sx={{ fontWeight: 600 }}>Delete this workflow</Typography>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Leads already in it stop getting its messages.</Typography>
          </Box>
          <Button color="error" variant="outlined" startIcon={<DeleteOutlinedIcon />} onClick={() => setConfirmDelete(true)}>Delete</Button>
        </Box>
      </Box>
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>Delete "{wf.name}"?</DialogTitle>
        <DialogContent><Typography>This can't be undone.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Keep it</Button>
          <Button color="error" variant="contained" onClick={() => { setConfirmDelete(false); onDelete(); }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

const HISTORY_KEYS = ["lead", "step", "status", "when"] as const;
type HistoryKey = (typeof HISTORY_KEYS)[number];

/** One table: everything this workflow did, for which lead, newest first. */
function HistoryTab({ wf }: { wf: Workflow }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const { sort, onSort } = useTableSort<HistoryKey>("estatekit_workflow_history_sort", { k: "when", dir: "desc" }, HISTORY_KEYS);
  const saved = isSaved(wf.id);
  const { data: log = [], isLoading } = useQuery({ queryKey: ["workflowLog", wf.id], queryFn: () => listWorkflowLog(wf.id), enabled: saved, refetchInterval: 30_000 });
  const rows = useMemo(() => log.map((r) => ({
    id: r.id,
    leadId: r.lead_id,
    lead: r.lead?.name ?? (r.lead_id ? "Deleted lead" : "Whole account"),
    step: r.detail ? `${r.what}: ${r.detail}` : r.what,
    status: r.status,
    when: r.at,
  })), [log]);
  const statuses = useMemo(() => [...new Set(rows.map((r) => r.status))].sort(), [rows]);
  const needle = q.trim().toLowerCase();
  const shown = sortRows(
    rows.filter((r) => (!needle || `${r.lead} ${r.step}`.toLowerCase().includes(needle)) && (status === "all" || r.status === status)),
    (r) => r[sort.k],
    sort.dir,
  );
  const color = (st: string) => (st === "Sent" || st === "Done" || st === "Yes" ? "success" : st === "Failed" ? "error" : st === "Stopped" || st === "Skipped" ? "warning" : "default") as "success" | "error" | "warning" | "default";
  return (
    <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
      <Box sx={{ maxWidth: 1000, mx: "auto" }}>
        <Typography component="div" sx={{ fontSize: 13.5, color: "text.secondary", mb: 2 }}>
          Every step this workflow ran, for which lead, newest first.
        </Typography>
        <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
          <TextField size="small" placeholder="Find a lead or step" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: 1, minWidth: 180 }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          <TextField select size="small" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ width: 190 }} aria-label="Status">
            <MenuItem value="all">All statuses</MenuItem>
            {statuses.map((st) => <MenuItem key={st} value={st}>{st}</MenuItem>)}
          </TextField>
        </Box>
        <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <SortHead k="lead" label="Lead" sort={sort} onSort={onSort} />
                <SortHead k="step" label="Step" sort={sort} onSort={onSort} />
                <SortHead k="status" label="Status" sort={sort} onSort={onSort} />
                <SortHead k="when" label="When (SAST)" sort={sort} onSort={onSort} firstDir="desc" />
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ fontWeight: 500, fontSize: 13.5, whiteSpace: "nowrap" }}>
                    {r.leadId && r.lead !== "Deleted lead" ? <Box component="a" href={`/leads/${r.leadId}`} sx={{ color: "inherit" }}>{r.lead}</Box> : r.lead}
                  </TableCell>
                  <TableCell sx={{ fontSize: 13, maxWidth: 420 }}>{r.step}</TableCell>
                  <TableCell><Chip size="small" label={r.status} variant="outlined" color={color(r.status)} sx={{ height: 22, fontSize: 12 }} /></TableCell>
                  <TableCell sx={{ fontSize: 13, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {new Date(r.when).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                </TableRow>
              ))}
              {!shown.length && (
                <TableRow>
                  <TableCell colSpan={4} sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
                    {!saved ? "Save the workflow first." : isLoading ? "Loading…" : rows.length ? "Nothing matches." : "Nothing has run yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}

// ── Editors ─────────────────────────────────────────────────────────────

/** A whole-number field that lets you clear it while typing, and only
 *  reports valid numbers (min..max) upward. Blur shows the value in use, so
 *  the field never shows something the workflow isn't using. */
function NumberField({ label, value, min, max = 9999, onChange, sx, helperText }: { label: string; value: number; min: number; max?: number; onChange: (n: number) => void; sx?: object; helperText?: string }) {
  // What you're typing while the box is focused; the real value otherwise
  // (so undo, or a change elsewhere, always shows).
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <TextField
      size="small"
      label={label}
      value={draft ?? String(value)}
      onFocus={() => setDraft(String(value))}
      helperText={helperText}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
        setDraft(raw);
        const n = Number(raw);
        if (raw !== "" && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => setDraft(null)}
      slotProps={{ htmlInput: { inputMode: "numeric", "aria-label": label } }}
      sx={sx}
    />
  );
}

function TriggerEditor({ t, onChange }: { t: Trigger; onChange: (t: Trigger) => void }) {
  const meta = TRIGGERS.find((x) => x.kind === t.kind);
  return (
    <>
      <TextField select size="small" label="Start this workflow when" value={t.kind} onChange={(e) => onChange(triggerOfKind(e.target.value as Trigger["kind"]))}>
        {TRIGGERS.map((x) => <MenuItem key={x.kind} value={x.kind}>{x.label}</MenuItem>)}
      </TextField>
      {meta?.help && <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: -1 }}>{meta.help}</Typography>}
      {t.kind === "stage_changed" && (
        <TextField select size="small" label="Stage" value={t.stage ?? ""} onChange={(e) => onChange({ ...t, stage: e.target.value })}>
          {optionsFor("stage", t.stage).map((o) => <MenuItem key={o.v} value={o.v}>{o.l}</MenuItem>)}
        </TextField>
      )}
      {t.kind === "no_answer_times" && <NumberField label="Missed calls" value={t.count ?? 2} min={1} max={20} onChange={(count) => onChange({ ...t, count })} />}
      {t.kind === "not_contacted_for" && <NumberField label="Days without contact" value={t.days ?? 14} min={1} max={365} onChange={(days) => onChange({ ...t, days })} />}
      {t.kind === "daily_at" && (
        <TextField size="small" type="time" label="Time (SAST)" value={t.time ?? "16:00"} onChange={(e) => onChange({ ...t, time: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
      )}
      {(t.kind === "appointment" || t.kind === "call_time") && (
        <Box sx={{ display: "flex", gap: 1 }}>
          <NumberField label="How long" value={t.amount ?? 1} min={1} max={999} onChange={(amount) => onChange({ ...t, amount })} sx={{ width: 96 }} />
          <TextField select size="small" label="Unit" value={t.unit ?? "days"} onChange={(e) => onChange({ ...t, unit: e.target.value as Trigger["unit"] })} sx={{ flex: 1 }}>
            <MenuItem value="minutes">minutes</MenuItem><MenuItem value="hours">hours</MenuItem><MenuItem value="days">days</MenuItem>
          </TextField>
          <TextField select size="small" label="When" value={t.when ?? "before"} onChange={(e) => onChange({ ...t, when: e.target.value as Trigger["when"] })} sx={{ flex: 1 }}>
            <MenuItem value="before">before</MenuItem><MenuItem value="after">after</MenuItem>
          </TextField>
        </Box>
      )}
      {t.kind === "appointment" && (
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
          Use {"{{appointment}}"} in a message for the day and time. Reminders before an appointment always go on time, even at night. One booked at shorter notice skips it.
        </Typography>
      )}
      {t.kind === "call_time" && (
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
          Use {"{{call_time}}"} in a message for the day and time they picked. Reminders before it always go on time. A time picked at shorter notice skips it.
        </Typography>
      )}
      {t.kind === "call_time_picked" && (
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
          Use {"{{call_time}}"} in a message for the day and time they picked. A "Set reminder" step due today puts the reminder at that time.
        </Typography>
      )}
      {t.kind === "daily_at" && <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>This runs once per agent, so its steps can only wait and WhatsApp the agent.</Typography>}
    </>
  );
}

function FiltersEditor({ filters, onChange }: { filters: Filter[]; onChange: (f: Filter[]) => void }) {
  const used = new Set(filters.map((f) => f.field));
  const unused = FILTER_FIELDS.filter((f) => !used.has(f.field));
  return (
    <>
      <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Leads must match all of these. Leave it empty to run for every lead.</Typography>
      {filters.map((f, i) => {
        const meta = FILTER_FIELDS.find((x) => x.field === f.field)!;
        return (
          <Box key={`${f.field}-${i}`} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <TextField
              select
              size="small"
              value={f.field}
              onChange={(e) => { const field = e.target.value as Filter["field"]; const opts = FILTER_FIELDS.find((x) => x.field === field)!.options(); onChange(filters.map((x, j) => (j === i ? { field, value: opts[0].v } : x))); }}
              sx={{ width: 120, flex: "none" }}
              aria-label="Filter on"
            >
              {FILTER_FIELDS.map((x) => <MenuItem key={x.field} value={x.field} disabled={used.has(x.field) && x.field !== f.field}>{x.label}</MenuItem>)}
            </TextField>
            <TextField select size="small" value={f.value} onChange={(e) => onChange(filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} sx={{ flex: 1, minWidth: 0 }} aria-label="Value">
              {(checkKind(f.field) ? optionsFor(checkKind(f.field)!, f.value) : meta.options()).map((o) => <MenuItem key={o.v} value={o.v}>{o.l}</MenuItem>)}
            </TextField>
            <IconButton size="small" onClick={() => onChange(filters.filter((_, j) => j !== i))} aria-label="Remove filter"><DeleteOutlinedIcon fontSize="small" /></IconButton>
          </Box>
        );
      })}
      <Button
        size="small"
        startIcon={<AddIcon />}
        disabled={!unused.length}
        onClick={() => onChange([...filters, { field: unused[0].field, value: unused[0].options()[0].v }])}
        sx={{ alignSelf: "flex-start" }}
      >
        Add filter
      </Button>
    </>
  );
}

function ExitsEditor({ exits, onChange }: { exits: Exit[]; onChange: (e: Exit[]) => void }) {
  const on = (k: Exit["kind"]) => exits.find((x) => x.kind === k)?.on ?? false;
  return (
    <>
      <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
        The lead leaves the workflow as soon as one of these happens, so nobody gets a "still interested?" message after they've booked.
      </Typography>
      {EXITS.map((x) => (
        <Box key={x.kind} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ flex: 1, fontSize: 14 }}>{x.label}</Typography>
          <Switch
            checked={on(x.kind)}
            onChange={(e) => onChange(EXITS.map((y) => ({ kind: y.kind, on: y.kind === x.kind ? e.target.checked : on(y.kind) })))}
            slotProps={{ input: { "aria-label": x.label } }}
          />
        </Box>
      ))}
    </>
  );
}

/** A message box with the details it can fill in listed under it, in plain
 *  words with what each turns into. A detail already in the message is ticked;
 *  one that can't go in this message gets a one-tap Remove (or Fix, when it
 *  looks like a typo of one that can). Tapping a detail adds it at the cursor. */
function MessageField({ label, value, onChange, kind, trigger, minRows }: { label: string; value: string; onChange: (v: string) => void; kind: MessageKind; trigger: Trigger; minRows: number }) {
  const editor = useRef<PillEditorHandle | null>(null);
  const insert = (f: string) => editor.current?.insertField(f, fieldToken(f));
  const tk = trigger.kind;
  // Stable per message type and trigger, so the box only redraws its pills when these change.
  const pillLabel = useCallback((f: string) => fieldInfo(f, { kind: tk } as Trigger).label, [tk]);
  const isBad = useCallback((f: string) => !fieldsFor(kind, { kind: tk } as Trigger).includes(f), [kind, tk]);
  const used = new Set(usedFields(value));
  const bad = badFields(value, kind, trigger);
  const daily = trigger.kind === "daily_at";
  return (
    <>
      {kind !== "email_lead" && <WaToolbar editor={editor} />}
      <PillEditor ref={editor} label={label} value={value} onChange={onChange} pillLabel={pillLabel} isBad={isBad} minRows={minRows} waMarks={kind !== "email_lead"} />
      {bad.length > 0 && (
        <Box sx={{ mt: -1, display: "flex", flexDirection: "column", gap: 0.75 }}>
          {bad.map((b) => (
            <Box key={b.field} sx={{ display: "flex", alignItems: "center", gap: 1, p: "8px 10px", borderRadius: "6px", bgcolor: tokens.redTint, border: `1px solid ${tokens.redBorder}` }}>
              <ErrorOutlineIcon sx={{ fontSize: 18, color: tokens.red, flex: "none" }} />
              <Typography sx={{ flex: 1, fontSize: 13, minWidth: 0 }}>{b.why}</Typography>
              <Button size="small" variant="contained" color={b.suggest ? "primary" : "error"} sx={{ flex: "none" }}
                onClick={() => onChange(replaceField(value, b.field, b.suggest))}>
                {b.suggest ? "Fix" : "Remove"}
              </Button>
            </Box>
          ))}
        </Box>
      )}
      <Box sx={{ mt: bad.length ? 0 : -1 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Add a detail</Typography>
        <Typography sx={{ fontSize: 12.5, color: "text.secondary", mb: 1 }}>
          {daily ? "Filled in for each agent when the summary goes out." : kind === "email_lead" ? "Filled in for each lead when the email goes out." : "Filled in for each lead when the message goes out."}
          {" "}Tap one to add it where your cursor is. It shows as a blue tag in the message; the preview shows what's actually sent.
        </Typography>
        {fieldGroups(kind, trigger).map(({ group, fields }) => (
          <Box key={group} sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", mb: 0.5 }}>{group}</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(auto-fill, minmax(170px, 1fr))" }, gap: 0.75 }}>
              {fields.map((f) => {
                const info = fieldInfo(f, trigger);
                const isIn = used.has(f);
                return (
                  <Box
                    key={f}
                    component="button"
                    type="button"
                    // Keep the cursor in the box: a tap would otherwise blur it first.
                    onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                    onClick={() => insert(f)}
                    aria-label={`Add ${info.label}${isIn ? " (already in the message)" : ""}`}
                    sx={{
                      display: "flex", alignItems: "flex-start", gap: 0.75, textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer",
                      minHeight: 44, minWidth: 0, p: "6px 8px", borderRadius: "6px",
                      border: `1px solid ${isIn ? tokens.greenBorder : tokens.divider}`,
                      bgcolor: isIn ? tokens.greenTint : "background.paper",
                      "&:hover, &:focus-visible": { borderColor: "primary.main", outline: "none" },
                    }}
                  >
                    {isIn ? <CheckIcon sx={{ fontSize: 16, color: tokens.green, mt: "1px", flex: "none" }} /> : <AddIcon sx={{ fontSize: 16, color: "text.secondary", mt: "1px", flex: "none" }} />}
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{info.label}</Box>
                      <Box sx={{ fontSize: 11.5, color: "text.secondary", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {isIn ? "In the message" : `e.g. ${info.example.split("\n")[0]}`}
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </>
  );
}

/** WhatsApp's formatting and emojis: buttons for what Ctrl+B / Ctrl+I do. */
const EMOJIS = ["😊", "👋", "🙏", "👍", "🎉", "✅", "🔥", "⭐", "🏡", "🏠", "🔑", "📍", "📅", "📞", "💬", "💰", "📈", "👉", "⚠️", "❤️"];
function WaToolbar({ editor }: { editor: React.MutableRefObject<PillEditorHandle | null> }) {
  const [emojiAt, setEmojiAt] = useState<HTMLElement | null>(null);
  // A tap mustn't take the cursor out of the box first.
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const tool = (label: string, icon: React.ReactNode, mark: string) => (
    <Tooltip title={label}>
      <IconButton size="small" aria-label={label} onMouseDown={keep} onClick={() => editor.current?.wrap(mark)}>{icon}</IconButton>
    </Tooltip>
  );
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, mb: -0.5, flexWrap: "wrap" }}>
      {tool("Bold (Ctrl+B)", <FormatBoldIcon fontSize="small" />, "*")}
      {tool("Italic (Ctrl+I)", <FormatItalicIcon fontSize="small" />, "_")}
      {tool("Strikethrough (Ctrl+Shift+X)", <StrikethroughSIcon fontSize="small" />, "~")}
      {tool("Monospace", <CodeIcon fontSize="small" />, "```")}
      <Tooltip title="Emoji">
        <IconButton size="small" aria-label="Emoji" onMouseDown={keep} onClick={(e) => setEmojiAt(e.currentTarget)}><InsertEmoticonIcon fontSize="small" /></IconButton>
      </Tooltip>
      {/* Opens without taking the focus out of the message, so the emoji goes where the cursor is. */}
      <Menu anchorEl={emojiAt} open={!!emojiAt} onClose={() => setEmojiAt(null)} autoFocus={false} disableAutoFocusItem disableAutoFocus disableEnforceFocus disableRestoreFocus slotProps={{ list: { sx: { display: "grid", gridTemplateColumns: "repeat(5, 40px)", p: 0.5 } } }}>
        {EMOJIS.map((em) => (
          <MenuItem key={em} onMouseDown={keep} onClick={() => { editor.current?.insertText(em); setEmojiAt(null); }} sx={{ justifyContent: "center", fontSize: 20, minHeight: 40, p: 0 }}>{em}</MenuItem>
        ))}
      </Menu>
      <Typography sx={{ fontSize: 11.5, color: "text.secondary", ml: 0.5 }}>Select words, then tap. Any emoji you type works too.</Typography>
    </Box>
  );
}

/** "Add a picture" / "Add a PDF" for a WhatsApp step; one at a time. */
function AttachmentPicker({ value, onChange }: { value: Attachment | null | undefined; onChange: (a: Attachment | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [want, setWant] = useState<"image" | "pdf">("image");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  function pick(kind: "image" | "pdf") {
    setWant(kind);
    setErr("");
    setTimeout(() => input.current?.click(), 0);
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (want === "pdf" ? !pdf : !file.type.startsWith("image/")) return setErr(want === "pdf" ? "That isn't a PDF." : "That isn't a picture.");
    if (file.size > MAX_WA_FILE_MB * 1024 * 1024) return setErr(`That's over ${MAX_WA_FILE_MB} MB. Choose a smaller file.`);
    setBusy(true);
    try {
      onChange(await uploadWhatsAppFile(file));
    } catch (e) {
      console.error(e);
      setErr("Couldn't upload it. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <Box>
      <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.75 }}>Send with it (optional)</Typography>
      {value ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: "6px 8px", border: `1px solid ${tokens.divider}`, borderRadius: "6px" }}>
          {value.kind === "image"
            ? <Box component="img" src={value.url} alt="" sx={{ width: 40, height: 40, objectFit: "cover", borderRadius: "4px" }} />
            : <PictureAsPdfOutlinedIcon sx={{ color: "#e53935" }} />}
          <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value.name}</Typography>
          <Button size="small" color="error" onClick={() => onChange(null)}>Remove</Button>
        </Box>
      ) : (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button size="small" variant="outlined" disabled={busy} startIcon={busy && want === "image" ? <CircularProgress size={14} /> : <ImageOutlinedIcon />} onClick={() => pick("image")}>Add a picture</Button>
          <Button size="small" variant="outlined" disabled={busy} startIcon={busy && want === "pdf" ? <CircularProgress size={14} /> : <PictureAsPdfOutlinedIcon />} onClick={() => pick("pdf")}>Add a PDF</Button>
        </Box>
      )}
      <input ref={input} type="file" hidden accept={want === "pdf" ? "application/pdf,.pdf" : "image/jpeg,image/png,image/gif,image/*"} onChange={(e) => void upload(e.target.files?.[0])} />
      <Typography sx={{ fontSize: 12, color: err ? tokens.red : "text.secondary", mt: 0.5 }}>
        {err || "A picture goes with the message as its caption; a PDF is sent with it as a document."}
      </Typography>
    </Box>
  );
}

function StepEditor({ step, trigger, onChange }: { step: Step; trigger: Trigger; onChange: (p: Partial<Step>, key?: string) => void }) {
  switch (step.type) {
    case "wait":
      return (
        <>
          <Box sx={{ display: "flex", gap: 1 }}>
            <NumberField label="Wait" value={step.amount} min={1} max={step.unit === "minutes" ? 1440 : step.unit === "hours" ? 168 : 365} onChange={(amount) => onChange({ amount }, "amount")} sx={{ width: 110 }} />
            <TextField select size="small" value={step.unit} onChange={(e) => onChange({ unit: e.target.value as Unit })} sx={{ flex: 1 }} aria-label="Unit">
              <MenuItem value="minutes">minutes</MenuItem>
              <MenuItem value="hours">hours</MenuItem>
              <MenuItem value="days">days</MenuItem>
            </TextField>
          </Box>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Counted from the step before. Quiet hours (Settings) can push a message to 08:00.</Typography>
        </>
      );
    case "whatsapp_agent":
      return (
        <>
          <MessageField label="Message to the agent" value={step.text} onChange={(text) => onChange({ text }, "text")} kind="whatsapp_agent" trigger={trigger} minRows={4} />
          <AttachmentPicker value={step.attachment} onChange={(attachment) => onChange({ attachment })} />
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
            Sent from the EstateKit WhatsApp number to the agent's own.
            {trigger.kind === "daily_at" ? " It's about their whole day, not one lead." : " Add the Call-and-log link so they can call the lead and log it in one tap."}
          </Typography>
        </>
      );
    case "whatsapp_lead":
      return (
        <>
          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", p: "10px 12px", borderRadius: "6px", bgcolor: tokens.amberTint, border: `1px solid ${tokens.amberBorder}`, fontSize: 13.5 }}>
            <SendToMobileIcon sx={{ fontSize: 18, color: "#d84315", mt: "1px" }} />
            <span>This goes to the <b>lead</b>, not to you.</span>
          </Box>
          <MessageField label="Message to the lead" value={step.text} onChange={(text) => onChange({ text }, "text")} kind="whatsapp_lead" trigger={trigger} minRows={4} />
          <AttachmentPicker value={step.attachment} onChange={(attachment) => onChange({ attachment })} />
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
            Sent from the EstateKit WhatsApp number to the lead&apos;s own. Staff accounts only. Skipped if the lead has no number or asked not to get WhatsApps. Keep it personal and expected: a lead who reports it can get the number blocked.
          </Typography>
        </>
      );
    case "email_lead":
      return (
        <>
          <TextField size="small" label="Subject" value={step.subject} onChange={(e) => onChange({ subject: e.target.value }, "subject")} />
          <MessageField label="Email" value={step.body} onChange={(body) => onChange({ body }, "body")} kind="email_lead" trigger={trigger} minRows={7} />
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>From the agent's name; replies go to the agent's email. Skipped for leads without an email address. Opens are tracked.</Typography>
        </>
      );
    case "set_stage":
      return (
        <TextField select size="small" label="Move lead to" value={step.stage} onChange={(e) => onChange({ stage: e.target.value })}>
          {optionsFor("stage", step.stage).map((o) => <MenuItem key={o.v} value={o.v}>{o.l}</MenuItem>)}
        </TextField>
      );
    case "reminder":
      return (
        <>
          <TextField size="small" label="Reminder" value={step.label} onChange={(e) => onChange({ label: e.target.value }, "label")} helperText="Shows in the lead's Next column" />
          <NumberField label="Due in (days, 0 = today)" value={step.inDays} min={0} max={365} onChange={(inDays) => onChange({ inDays }, "days")} />
        </>
      );
    case "tag":
      return (
        <>
          <TextField size="small" label="Tag" value={step.tag} onChange={(e) => onChange({ tag: e.target.value.slice(0, 30) }, "tag")} placeholder="e.g. Investor, Nurture" />
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Tags show on the lead for EstateKit staff, not the agent. Other workflows can check for them.</Typography>
        </>
      );
    case "branch": {
      const meta = BRANCH_CHECKS.find((x) => x.check === step.check);
      const kind = checkKind(step.check);
      const options = kind ? optionsFor(kind, step.value) : [];
      return (
        <>
          <TextField select size="small" label="Check" value={step.check} onChange={(e) => { const check = e.target.value as BranchCheck; onChange({ check, value: defaultBranchValue(check) }); }}>
            {BRANCH_CHECKS.map((x) => <MenuItem key={x.check} value={x.check}>{x.label}</MenuItem>)}
          </TextField>
          {meta?.needsValue && (
            <TextField select size="small" label={branchLabel(step.check)} value={step.value} onChange={(e) => onChange({ value: e.target.value })}>
              {options.map((o) => <MenuItem key={o.v} value={o.v}>{o.l}</MenuItem>)}
            </TextField>
          )}
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Add steps under Yes and No on the canvas. Both paths join again and carry on to the steps below.</Typography>
        </>
      );
    }
  }
}

// ── Previews: what each node actually does, on a sample lead ─────────────

const STAGE_COLOR: Record<string, string> = {
  "New Lead": tokens.primary, "No Answer": tokens.orange, Contacted: tokens.purple, Booked: tokens.green, "Viewing Booked": tokens.green,
  "Offer Made": tokens.teal, "Mandate Signed": tokens.greenDark, Bought: tokens.greenDark, Lost: tokens.ink3, "Invalid Number": tokens.ink3,
};

function StageChip({ stage, glow }: { stage: string; glow?: boolean }) {
  const c = STAGE_COLOR[stage] ?? tokens.ink2;
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: 12.5, fontWeight: 500, px: 1, py: 0.25, borderRadius: "999px", color: c, bgcolor: `color-mix(in srgb, ${c} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 35%, transparent)`, boxShadow: glow ? `0 0 0 3px color-mix(in srgb, ${c} 22%, transparent)` : "none", whiteSpace: "nowrap" }}>
      <Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: c }} />{stage || "…"}
    </Box>
  );
}

/** A lead as it appears in the leads list, so the change is obvious. */
function LeadRowMock({ stage, next, nextDue, tags = [], newTag, highlight }: { stage: string; next?: string; nextDue?: string; tags?: string[]; newTag?: string; highlight?: "stage" | "next" | "tag" }) {
  const hl = (on: boolean) => (on ? { bgcolor: tokens.amberTint, outline: "2px solid #ffb300", outlineOffset: 2, borderRadius: "4px" } : {});
  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "4px", bgcolor: "background.paper", p: 1.25, display: "grid", gap: 0.75 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: tokens.primaryBg, color: "primary.main", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flex: "none" }}>TM</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{SAMPLE_LEAD.name}</Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{SAMPLE_LEAD.phone} · Bryanston</Typography>
        </Box>
        <Box sx={hl(highlight === "stage")}><StageChip stage={stage} glow={highlight === "stage"} /></Box>
      </Box>
      {(next || nextDue) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: 13, color: nextDue ? tokens.orange : "text.secondary", ...hl(highlight === "next"), px: highlight === "next" ? 0.5 : 0 }}>
          {nextDue && <AlarmIcon sx={{ fontSize: 15 }} />}
          <span>Next: {next}</span>
          {nextDue && <Box component="span" sx={{ color: "text.secondary" }}>· {nextDue}</Box>}
        </Box>
      )}
      {(tags.length > 0 || newTag !== undefined) && (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {tags.map((t) => <LeadTag key={t} label={t} />)}
          {newTag !== undefined && <LeadTag label={newTag} highlight={highlight === "tag"} />}
        </Box>
      )}
    </Box>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary", fontSize: 12.5, pl: 2 }}>
      <Box sx={{ width: 2, height: 18, bgcolor: tokens.line }} />{label}
    </Box>
  );
}

const when = (d: Date) => d.toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** How the email lands in the lead's inbox, filled in for a sample lead. */
function EmailPreview({ subject, body, trigger }: { subject: string; body: string; trigger: Trigger }) {
  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", fontSize: 13 }}>
      <Box sx={{ bgcolor: tokens.surface2, px: 1.5, py: 1, borderBottom: `1px solid ${tokens.divider}` }}>
        <Box><Box component="span" sx={{ color: "text.secondary" }}>From:</Box> Megan Demo</Box>
        <Box><Box component="span" sx={{ color: "text.secondary" }}>To:</Box> thandi@example.com</Box>
        <Box sx={{ fontWeight: 600, mt: 0.5 }}>{fill(subject, trigger) || "(no subject)"}</Box>
      </Box>
      <Box sx={{ p: 1.5, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{fill(body, trigger) || <Box component="span" sx={{ color: "text.disabled" }}>Nothing written yet</Box>}</Box>
    </Box>
  );
}

function NodePreview({ sel, wf, step }: { sel: Selection; wf: Workflow; step: Step | undefined }) {
  let body: React.ReactNode = null;
  const first = SAMPLE_LEAD.name.split(" ")[0];
  if (sel?.kind === "trigger") {
    const t = wf.trigger;
    const event =
      t.kind === "stage_changed" ? <>Agent moves {first} to <StageChip stage={t.stage ?? ""} /></>
        : t.kind === "lead_created" ? <>{SAMPLE_LEAD.name} fills in the form on your ad</>
        : t.kind === "came_back" ? <>{SAMPLE_LEAD.name}, already in your leads, fills in your form again</>
          : t.kind === "no_answer_times" ? <>Agent logs "No answer" for {first} the {ordinal(t.count ?? 1)} time</>
            : t.kind === "not_contacted_for" ? <>{first} hasn't been called or moved for {unitLabel(t.days ?? 14, "days")}</>
              : t.kind === "plan_opened" ? <>{first} opens the Marketing Plan link</>
                : t.kind === "reminder_due" ? <>A reminder for {first} comes due</>
                  : t.kind === "appointment" ? <>It's {triggerSummary(t)} with {first} ({SAMPLE_FIELDS.appointment})</>
                  : t.kind === "call_time_picked" ? <>{first} picks a time for a call: {SAMPLE_FIELDS.call_time}</>
                  : t.kind === "call_time" ? <>It's {triggerSummary(t)} with {first} ({SAMPLE_FIELDS.call_time})</>
                  : <>It's a weekday and the clock hits {t.time || "16:00"}</>;
    body = (
      <>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", fontSize: 13.5 }}><BoltIcon sx={{ fontSize: 18, color: tokens.primary }} />{event}</Box>
        <Arrow label={t.kind === "daily_at" ? "This workflow runs once for each agent" : "This workflow starts for that lead"} />
        {t.kind !== "daily_at" && <LeadRowMock stage={t.kind === "stage_changed" ? t.stage ?? "New Lead" : t.kind === "no_answer_times" ? "No Answer" : t.kind === "lead_created" || t.kind === "came_back" || t.kind === "call_time_picked" || t.kind === "call_time" ? "New Lead" : t.kind === "appointment" ? "Booked" : "Contacted"} highlight={t.kind === "stage_changed" ? "stage" : undefined} />}
      </>
    );
  } else if (sel?.kind === "filters") {
    body = wf.filters.length ? (
      <Box sx={{ display: "grid", gap: 0.75 }}>
        {wf.filters.map((f, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1, fontSize: 13.5 }}>
            <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: tokens.greenTint, color: tokens.green, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>✓</Box>
            {filterSummary(f)}
          </Box>
        ))}
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>A lead must match all of these to go through. One that misses any is skipped.</Typography>
      </Box>
    ) : <Typography sx={{ fontSize: 13.5 }}>No filters: every lead goes through.</Typography>;
  } else if (sel?.kind === "exits") {
    const on = wf.exits.filter((x) => x.on);
    body = on.length ? (
      <>
        <LeadRowMock stage="Booked" highlight="stage" />
        <Arrow label={`${first} booked, so she leaves the workflow`} />
        <Typography sx={{ fontSize: 13.5 }}>No more messages go to her or about her.</Typography>
      </>
    ) : <Typography sx={{ fontSize: 13.5, color: tokens.amber }}>Nothing stops it: every step runs, even after she books.</Typography>;
  } else if (step) {
    const start = new Date();
    start.setHours(10, 0, 0, 0);
    switch (step.type) {
      case "whatsapp_agent":
        body = (
          <>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Arrives on the agent's WhatsApp:</Typography>
            <WhatsAppPreview lead={SAMPLE_LEAD} text={step.text || " "} sampleFields={sampleFields(wf.trigger)} attachment={step.attachment} />
          </>
        );
        break;
      case "whatsapp_lead":
        body = (
          <>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Arrives on {first}'s own WhatsApp:</Typography>
            <WhatsAppPreview lead={SAMPLE_LEAD} text={step.text || " "} sampleFields={sampleFields(wf.trigger)} attachment={step.attachment} />
          </>
        );
        break;
      case "email_lead":
        body = (
          <>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Lands in {first}'s inbox:</Typography>
            <EmailPreview subject={step.subject} body={step.body} trigger={wf.trigger} />
          </>
        );
        break;
      case "wait": {
        let next = new Date(start.getTime() + waitMinutes(step) * 60000);
        const h = next.getHours();
        const deferred = wf.settings.quietHours && (h >= 20 || h < 8);
        if (deferred) { next = new Date(next); if (h >= 20) next.setDate(next.getDate() + 1); next.setHours(8, 0, 0, 0); }
        body = (
          <Box sx={{ display: "grid", gap: 0.5, fontSize: 13.5 }}>
            <Box sx={{ display: "flex", gap: 1 }}><Box sx={{ color: "text.secondary", width: 96 }}>Step before</Box><b>{when(start)}</b></Box>
            <Arrow label={`waits ${unitLabel(step.amount, step.unit)}`} />
            <Box sx={{ display: "flex", gap: 1 }}><Box sx={{ color: "text.secondary", width: 96 }}>Next step</Box><b>{when(next)}</b></Box>
            {deferred && <Typography sx={{ fontSize: 12.5, color: tokens.amber }}>Pushed to 08:00 by quiet hours.</Typography>}
          </Box>
        );
        break;
      }
      case "set_stage":
        body = (
          <>
            <LeadRowMock stage="New Lead" />
            <Arrow label={`stage changes to ${step.stage || "…"}`} />
            <LeadRowMock stage={step.stage} highlight="stage" />
          </>
        );
        break;
      case "reminder": {
        const due = new Date(start.getTime() + step.inDays * 86_400_000);
        body = (
          <>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>On the agent's leads list:</Typography>
            <LeadRowMock stage="No Answer" next={fill(step.label) || "Follow up"} nextDue={step.inDays === 0 ? "due today" : `due ${when(due)}`} highlight="next" />
          </>
        );
        break;
      }
      case "tag":
        body = (
          <>
            <LeadRowMock stage="Contacted" />
            <Arrow label="tag added (staff see it on the lead)" />
            <LeadRowMock stage="Contacted" newTag={step.tag} highlight="tag" />
          </>
        );
        break;
      case "branch": {
        const meta = BRANCH_CHECKS.find((x) => x.check === step.check);
        const yesLabel = step.check === "opened_last_email" ? "She opened it" : step.check === "has_email" ? "She has an email" : `${meta?.label} ${checkKind(step.check) ? valueLabel(checkKind(step.check)!, step.value) : step.value || "…"}`;
        body = (
          <>
            <Typography sx={{ fontSize: 13.5 }}>The workflow checks {first}: <b>{stepSummary(step)}</b></Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
              <Box sx={{ border: `1px solid ${tokens.greenBorder}`, bgcolor: tokens.greenTint, borderRadius: "4px", p: 1, fontSize: 12.5 }}>
                <b style={{ color: tokens.greenDark }}>Yes</b><br />{yesLabel} → the Yes path ({step.yes.length} step{step.yes.length === 1 ? "" : "s"})
              </Box>
              <Box sx={{ border: `1px solid ${tokens.divider}`, bgcolor: tokens.surface2, borderRadius: "4px", p: 1, fontSize: 12.5 }}>
                <b>No</b><br />Otherwise → the No path ({step.no.length} step{step.no.length === 1 ? "" : "s"})
              </Box>
            </Box>
          </>
        );
        break;
      }
    }
  }
  if (!body) return null;
  return (
    <Box sx={{ bgcolor: tokens.bg, border: `1px solid ${tokens.divider}`, borderRadius: "6px", p: 1.5, display: "grid", gap: 1 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "text.secondary" }}>What happens</Typography>
      {body}
    </Box>
  );
}
