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
  Drawer,
  IconButton,
  InputAdornment,
  InputBase,
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
import EditIcon from "@mui/icons-material/Edit";
import SearchIcon from "@mui/icons-material/Search";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { tokens } from "../theme";
import { useAutomations, useAutomationSteps } from "../hooks/useAutomations";
import { useSnack } from "../hooks/useSnack";
import WhatsAppPreview from "./WhatsAppPreview";
import LeadTag from "./LeadTag";
import { PlainHead, SortHead, sortRows, useTableSort } from "./SortHead";
import {
  BRANCH_CHECKS, EXITS, FILTER_FIELDS, KNOWN_TAGS, PIPELINES, SOURCES, STAGES, STEP_TYPES, TEMPLATES, TRIGGERS,
  allowedSteps, branchLabel, confirmationEmail, countSteps, defaultBranchValue, fieldsFor, filterSummary, findStep, fromAutomation,
  insertStep, locate, moveStep, newStep, ordinal, problemCount, removeStep, stepSummary, stepTitle, timeLabel, timeline,
  triggerOfKind, triggerSummary, unitLabel, updateStep, validate, waitMinutes,
  type BranchCheck, type Exit, type Filter, type Path, type Problems, type Settings, type Step, type StepType, type Trigger,
  type Unit, type Workflow,
} from "../lib/workflow";

// Workflow builder: trigger → only if → steps (with waits and if/else
// paths) → stop early when. The model, every edit and every check live in
// lib/workflow.ts (unit-tested); this file only draws it and calls those.
//
// UI ONLY FOR NOW. Today's real automations and the lead confirmation email
// are shown here as workflows; edits stay on this screen and Save is off.
// Backend plan (add-only): `workflows` + `workflow_steps` (parent_id,
// branch, order, type, config); run-automations grows a step-type switch,
// branch walking and the stop-early checks.

const STEP_ICON: Record<StepType, React.ReactNode> = {
  wait: <ScheduleIcon />, whatsapp_agent: <WhatsAppIcon />, email_lead: <EmailIcon />, branch: <CallSplitIcon />,
  set_stage: <FlagIcon />, reminder: <AlarmIcon />, tag: <LocalOfferIcon />,
};

// Icon tiles: mid-tone fills with white icons, readable in light and dark.
const STEP_COLOR: Record<StepType, string> = {
  wait: "#607d8b", whatsapp_agent: "#1a8f45", email_lead: "#1565c0", branch: "#455a64",
  set_stage: "#6a1b9a", reminder: "#ad1457", tag: "#00796b",
};

const SAMPLE_LEAD = { id: "sample", name: "Thandi Mokoena", phone: "082 555 0199", stage: "No Answer", next_label: "Retry today" };
const SAMPLE_FIELDS: Record<string, string> = {
  first_name: "Thandi", name: "Thandi Mokoena", area: "Bryanston", address: "14 Oak Avenue, Bryanston", agent_name: "Megan Demo",
  agent_phone: "083 555 0103", plan_link: "leads.estatekit.co/plan/…", stage: "No Answer", next_label: "Retry today",
  count: "7", leads_word: "leads",
};
const fill = (t: string) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => SAMPLE_FIELDS[k] ?? (k === "action_link" ? "leads.estatekit.co/l/…" : m));

// ── Root: list ↔ editor ──────────────────────────────────────────────────

export default function WorkflowBuilder() {
  const { data: automations, isLoading: l1 } = useAutomations();
  const { data: steps, isLoading: l2 } = useAutomationSteps();
  // Built once: later refetches mustn't wipe edits made on this screen.
  const initial = useMemo(() => {
    if (l1 || l2) return null;
    return [
      ...(automations ?? []).map((a) => fromAutomation(a, (steps ?? []).filter((s) => s.automation_id === a.id))),
      confirmationEmail(),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l1 || l2]);
  if (!initial) return <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}><CircularProgress /></Box>;
  return <Workflows initial={initial} />;
}

function Workflows({ initial }: { initial: Workflow[] }) {
  const [workflows, setWorkflows] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const open = workflows.find((w) => w.id === openId);

  const create = (t: (typeof TEMPLATES)[number]) => {
    const w = t.make();
    setWorkflows((all) => [...all, w]);
    setOpenId(w.id);
    setPicker(false);
  };

  return (
    <>
      {open ? (
        <Editor
          key={open.id}
          initial={open}
          onBack={(w) => { setWorkflows((all) => all.map((x) => (x.id === w.id ? w : x))); setOpenId(null); }}
          onDelete={() => { setWorkflows((all) => all.filter((x) => x.id !== open.id)); setOpenId(null); }}
        />
      ) : (
        <WorkflowList workflows={workflows} onOpen={setOpenId} onCreate={() => setPicker(true)} />
      )}
      <Dialog open={picker} onClose={() => setPicker(false)} fullWidth maxWidth="sm">
        <DialogTitle>Start from a template</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {TEMPLATES.map((t) => (
            <Box
              key={t.name}
              component="button"
              type="button"
              onClick={() => create(t)}
              sx={{ textAlign: "left", font: "inherit", color: "inherit", bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "6px", p: 1.5, cursor: "pointer", "&:hover, &:focus-visible": { borderColor: "primary.main", bgcolor: tokens.hover, outline: "none" } }}
            >
              <Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>{t.name}</Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{t.blurb}</Typography>
            </Box>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── List ─────────────────────────────────────────────────────────────────

/** Who gets what, in words: "WhatsApp to agent", "Email to lead". */
function Sends({ steps }: { steps: Step[] }) {
  const kinds = new Set<StepType>();
  const walk = (list: Step[]) => list.forEach((s) => { kinds.add(s.type); if (s.type === "branch") { walk(s.yes); walk(s.no); } });
  walk(steps);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
      {kinds.has("whatsapp_agent") && <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, fontSize: 13, whiteSpace: "nowrap" }}><WhatsAppIcon sx={{ fontSize: 16, color: "#25d366" }} />WhatsApp to agent</Box>}
      {kinds.has("email_lead") && <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, fontSize: 13, whiteSpace: "nowrap" }}><EmailIcon sx={{ fontSize: 16, color: tokens.primary }} />Email to lead</Box>}
      {!kinds.has("whatsapp_agent") && !kinds.has("email_lead") && <Box sx={{ fontSize: 13, color: "text.secondary" }}>No messages</Box>}
    </Box>
  );
}

function OnOffChip({ on }: { on: boolean }) {
  return <Chip size="small" label={on ? "On" : "Off"} color={on ? "success" : "default"} variant={on ? "filled" : "outlined"} sx={{ height: 22, fontSize: 12, fontWeight: 600, minWidth: 44 }} />;
}

const LIST_KEYS = ["name", "trigger", "steps", "status"] as const;
type ListKey = (typeof LIST_KEYS)[number];

function WorkflowList({ workflows, onOpen, onCreate }: { workflows: Workflow[]; onOpen: (id: string) => void; onCreate: () => void }) {
  const isDesktop = useMediaQuery("(min-width:900px)");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "on" | "off">("all");
  const { sort, onSort } = useTableSort<ListKey>("estatekit_workflows_sort", { k: "status", dir: "desc" }, LIST_KEYS);
  const count = (on: boolean) => workflows.filter((w) => w.published === on).length;
  const needle = q.trim().toLowerCase();
  const shown = sortRows(
    workflows.filter((w) => (filter === "all" || (filter === "on") === w.published) && (!needle || `${w.name} ${triggerSummary(w.trigger)}`.toLowerCase().includes(needle))),
    (w) => (sort.k === "name" ? w.name : sort.k === "trigger" ? triggerSummary(w.trigger) : sort.k === "steps" ? countSteps(w.steps) : Number(w.published)),
    sort.dir,
  );

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto", p: 2, pb: 6 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 500 }}>Workflows</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Each workflow sends messages or updates a lead for you when something happens.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>Create workflow</Button>
      </Box>
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <Tabs value={filter} onChange={(_, v) => setFilter(v)} sx={{ minHeight: 40, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600, px: 1.5, minWidth: 0 } }}>
          <Tab value="all" label={`All (${workflows.length})`} />
          <Tab value="on" label={`On (${count(true)})`} />
          <Tab value="off" label={`Off (${count(false)})`} />
        </Tabs>
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small"
          placeholder="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ width: 260, maxWidth: "100%" }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
      </Box>

      <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", overflow: "hidden" }}>
        {isDesktop ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <SortHead k="name" label="Name" sort={sort} onSort={onSort} />
                <SortHead k="trigger" label="Starts when" sort={sort} onSort={onSort} />
                <PlainHead>Sends</PlainHead>
                <SortHead k="steps" label="Steps" sort={sort} onSort={onSort} num />
                <SortHead k="status" label="Status" sort={sort} onSort={onSort} firstDir="desc" />
                <PlainHead sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((w) => (
                <TableRow key={w.id} hover onClick={() => onOpen(w.id)} sx={{ cursor: "pointer", "&:last-child td": { borderBottom: 0 }, "& td": { py: 1.25 } }}>
                  <TableCell sx={{ fontWeight: 500, fontSize: 14 }}>
                    {w.name}
                    <ListFlags w={w} />
                  </TableCell>
                  <TableCell sx={{ fontSize: 13, color: "text.secondary" }}>{triggerSummary(w.trigger)}</TableCell>
                  <TableCell><Sends steps={w.steps} /></TableCell>
                  <TableCell align="right" sx={{ fontSize: 13 }}>{countSteps(w.steps)}</TableCell>
                  <TableCell><OnOffChip on={w.published} /></TableCell>
                  <TableCell padding="checkbox"><ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          shown.map((w, i) => (
            <Box
              key={w.id}
              component="button"
              type="button"
              onClick={() => onOpen(w.id)}
              sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%", textAlign: "left", font: "inherit", color: "inherit", bgcolor: "transparent", border: 0, borderTop: i ? `1px solid ${tokens.divider}` : 0, p: "12px 14px", minHeight: 64, cursor: "pointer" }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 500, fontSize: 14.5 }}>{w.name}<ListFlags w={w} /></Typography>
                <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{triggerSummary(w.trigger)}</Typography>
                <Box sx={{ mt: 0.5 }}><Sends steps={w.steps} /></Box>
              </Box>
              <OnOffChip on={w.published} />
            </Box>
          ))
        )}
        {!shown.length && <Typography sx={{ color: "text.secondary", textAlign: "center", py: 6 }}>No workflows match.</Typography>}
      </Box>
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
type EditorTab = "builder" | "settings" | "history";

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

function Editor({ initial, onBack, onDelete }: { initial: Workflow; onBack: (w: Workflow) => void; onDelete: () => void }) {
  const isDesktop = useMediaQuery("(min-width:1000px)");
  const showSnack = useSnack();
  const { wf, set, undo, redo, canUndo, canRedo, dirty } = useHistory(initial);
  const [tab, setTab] = useState<EditorTab>("builder");
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

  // Turning on is the one place the checks bite: a broken workflow stays off.
  const setOn = (on: boolean) => {
    if (on && nProblems) {
      showSnack(`Fix ${nProblems} thing${nProblems === 1 ? "" : "s"} first`);
      goToFirstProblem();
      return;
    }
    update({ published: on });
  };

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

  return (
    // A fixed-height frame: the header and tabs never scroll away, and the
    // canvas and the details panel each scroll on their own.
    <Box sx={{ height: "calc(100dvh - 100px)", display: "flex", flexDirection: "column", minHeight: 420 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, height: 56, flex: "none", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => onBack(wf)} sx={{ textTransform: "none", color: "text.primary", flex: "none" }} aria-label="Back to workflows">
          {isDesktop ? "Workflows" : ""}
        </Button>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 0.5 }}>
          {editingName ? (
            <InputBase
              autoFocus
              value={wf.name}
              onChange={(e) => update({ name: e.target.value }, "name")}
              onBlur={finishName}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLElement).blur(); }}
              inputProps={{ "aria-label": "Workflow name", maxLength: 80 }}
              sx={{ fontWeight: 600, fontSize: 15, borderBottom: "2px solid", borderColor: "primary.main", maxWidth: 420, width: "100%", "& input": { textAlign: "center" } }}
            />
          ) : (
            <Box component="button" type="button" onClick={() => setEditingName(true)} sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, minWidth: 0, font: "inherit", color: "inherit", bgcolor: "transparent", border: 0, cursor: "text", p: "6px 8px", borderRadius: "4px", "&:hover": { bgcolor: tokens.hover } }}>
              <Typography noWrap sx={{ fontWeight: 600, fontSize: 15 }}>{wf.name}</Typography>
              <EditIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            </Box>
          )}
        </Box>
        {nProblems > 0 && (
          <Tooltip title="Show the first one">
            <Chip
              size="small"
              color="error"
              variant="outlined"
              icon={<ErrorOutlineIcon />}
              label={isDesktop ? `${nProblems} to fix` : nProblems}
              onClick={goToFirstProblem}
              sx={{ flex: "none" }}
            />
          </Tooltip>
        )}
        <Tooltip title="Undo (Ctrl+Z)"><span><IconButton onClick={undo} disabled={!canUndo} aria-label="Undo"><UndoIcon fontSize="small" /></IconButton></span></Tooltip>
        {isDesktop && <Tooltip title="Redo (Ctrl+Shift+Z)"><span><IconButton onClick={redo} disabled={!canRedo} aria-label="Redo"><RedoIcon fontSize="small" /></IconButton></span></Tooltip>}
        <Tooltip title={wf.published ? "On: running for leads" : nProblems ? "Fix the problems to turn it on" : "Off: not running"}>
          <Box sx={{ display: "flex", alignItems: "center", flex: "none" }}>
            {isDesktop && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{wf.published ? "On" : "Off"}</Typography>}
            <Switch checked={wf.published} onChange={(e) => setOn(e.target.checked)} slotProps={{ input: { "aria-label": "Workflow on" } }} />
          </Box>
        </Tooltip>
        <Tooltip title="Preview only: saving comes with the backend">
          <span>
            <Button variant="contained" size="small" disabled sx={{ position: "relative", overflow: "visible" }}>
              Save
              {dirty && <Box component="span" sx={{ position: "absolute", top: -4, right: -4, width: 10, height: 10, borderRadius: "50%", bgcolor: tokens.red, border: `2px solid ${tokens.surface}` }} aria-label="Unsaved changes" />}
            </Button>
          </span>
        </Tooltip>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ flex: "none", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, minHeight: 44, "& .MuiTabs-flexContainer": { justifyContent: { md: "center" } } }}
      >
        {([["builder", "Builder"], ["settings", "Settings"], ["history", "History"]] as const).map(([v, l]) => (
          <Tab key={v} value={v} label={l} sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }} />
        ))}
      </Tabs>

      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
        {tab === "builder" && (
          <>
            <Canvas wf={wf} sel={sel} setSel={setSel} onAdd={addStep} problems={problems} />
            {isDesktop ? (
              panelOpen && <Box sx={{ width: 380, flex: "none", borderLeft: `1px solid ${tokens.divider}`, bgcolor: "background.paper", minHeight: 0 }}>{panel}</Box>
            ) : (
              <Drawer anchor="bottom" open={panelOpen} onClose={() => setSel(null)} slotProps={{ paper: { sx: { height: "85dvh", borderRadius: "12px 12px 0 0" } } }}>
                {panel}
              </Drawer>
            )}
          </>
        )}
        {tab === "settings" && <SettingsTab wf={wf} onChange={update} onDelete={onDelete} />}
        {tab === "history" && <HistoryTab wf={wf} />}
      </Box>
    </Box>
  );
}

/** The side/bottom sheet: title and close stay pinned at the top, Done,
 *  Move and Delete at the bottom, and only the fields in between scroll.
 *  Keyed by what's selected, so a half-confirmed delete never carries over
 *  to another step. */
function DetailsPanel({ title, problems, onClose, onDelete, deleteLabel, onMove, canMoveUp, canMoveDown, children }: {
  title: string; problems: string[]; onClose: () => void; onDelete?: () => void; deleteLabel: string;
  onMove?: (dir: -1 | 1) => void; canMoveUp: boolean; canMoveDown: boolean; children: React.ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, height: 52, flex: "none", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Typography sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>{title}</Typography>
        {onMove && (
          <>
            <Tooltip title="Move up"><span><IconButton size="small" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Move step up"><ArrowUpwardIcon fontSize="small" /></IconButton></span></Tooltip>
            <Tooltip title="Move down"><span><IconButton size="small" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Move step down"><ArrowDownwardIcon fontSize="small" /></IconButton></span></Tooltip>
          </>
        )}
        <IconButton onClick={onClose} aria-label="Close" size="small"><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", p: 2, display: "flex", flexDirection: "column", gap: 2, "& > *": { flexShrink: 0 } }}>
        {problems.length > 0 && (
          <Alert severity="error" sx={{ py: 0.5 }}>
            {problems.length === 1 ? problems[0] : <Box component="ul" sx={{ m: 0, pl: 2 }}>{problems.map((p) => <li key={p}>{p}</li>)}</Box>}
          </Alert>
        )}
        {children}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.25, pb: "calc(10px + env(safe-area-inset-bottom, 0px))", flex: "none", bgcolor: "background.paper", borderTop: `1px solid ${tokens.divider}` }}>
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

// ── Canvas ───────────────────────────────────────────────────────────────

function Canvas({ wf, sel, setSel, onAdd, problems }: { wf: Workflow; sel: Selection; setSel: (s: Selection) => void; onAdd: (path: Path, index: number, t: StepType) => void; problems: Problems }) {
  const narrow = useMediaQuery("(max-width:700px)");
  const [zoom, setZoom] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const exitsOn = wf.exits.filter((x) => x.on);
  const allowed = allowedSteps(wf.trigger);
  const ctx: StepCtx = { sel, setSel, onAdd, narrow, problems, allowed };

  return (
    <Box sx={{ flex: 1, minWidth: 0, position: "relative", bgcolor: tokens.bg }}>
      <Box
        ref={scroller}
        sx={{
          position: "absolute", inset: 0, overflow: "auto",
          // Dot grid, the usual "this is a canvas" cue.
          backgroundImage: `radial-gradient(circle, ${tokens.line} 1px, transparent 1px)`,
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        }}
      >
        {wf.note && (
          <Box sx={{ position: "sticky", top: 0, left: 0, zIndex: 2, display: "flex", gap: 1, alignItems: "flex-start", bgcolor: tokens.amberTint, borderBottom: `1px solid ${tokens.amberBorder}`, px: 2, py: 1 }}>
            <WarningAmberIcon sx={{ fontSize: 18, color: tokens.amber, mt: "2px" }} />
            <Typography sx={{ fontSize: 13 }}>{wf.note}</Typography>
          </Box>
        )}
        <Box sx={{ zoom, display: "flex", flexDirection: "column", alignItems: "center", py: 4, px: 3, minWidth: "fit-content" }}>
          <Node color="#1565c0" icon={<BoltIcon />} title="Trigger" text={triggerSummary(wf.trigger)} selected={sel?.kind === "trigger"} error={!!problems.trigger} onClick={() => setSel({ kind: "trigger" })} />
          <Line />
          <Node
            color="#546e7a"
            icon={<FilterAltIcon />}
            title="Only if"
            text={wf.filters.length ? wf.filters.map(filterSummary).join(" · ") : "Every lead (no filters)"}
            selected={sel?.kind === "filters"}
            error={!!problems.filters}
            onClick={() => setSel({ kind: "filters" })}
            dashed={!wf.filters.length}
          />
          <StepList steps={wf.steps} path="root" ctx={ctx} />
          <Line />
          <Node
            color="#b71c1c"
            icon={<BlockIcon />}
            title="Stop early when"
            text={exitsOn.length ? exitsOn.map((x) => EXITS.find((e) => e.kind === x.kind)?.label.replace(/ \(.*\)$/, "")).join(" · ") : "Nothing: every step always runs"}
            selected={sel?.kind === "exits"}
            onClick={() => setSel({ kind: "exits" })}
            dashed={!exitsOn.length}
          />
          <Line />
          <Box sx={{ px: 1.5, py: 0.5, borderRadius: "999px", bgcolor: "#37474f", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: ".08em" }}>END</Box>
          <Timeline wf={wf} />
        </Box>
      </Box>

      <Box sx={{ position: "absolute", left: 12, bottom: 12, display: "flex", alignItems: "center", bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "6px", boxShadow: `0 1px 3px ${tokens.shadow}` }}>
        <IconButton size="small" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))} disabled={zoom <= 0.5} aria-label="Zoom out"><ZoomOutIcon fontSize="small" /></IconButton>
        <Typography sx={{ fontSize: 12, width: 40, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{Math.round(zoom * 100)}%</Typography>
        <IconButton size="small" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1)))} disabled={zoom >= 1.5} aria-label="Zoom in"><ZoomInIcon fontSize="small" /></IconButton>
        <Tooltip title="Fit to screen">
          <IconButton
            size="small"
            aria-label="Fit to screen"
            onClick={() => {
              const el = scroller.current;
              if (!el) return;
              const inner = el.lastElementChild as HTMLElement | null;
              const w = (inner?.scrollWidth ?? el.scrollWidth) / zoom;
              setZoom(Math.max(0.5, Math.min(1, +((el.clientWidth - 24) / w).toFixed(2))));
              el.scrollTo({ top: 0, left: 0 });
            }}
          >
            <FitScreenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

interface StepCtx {
  sel: Selection;
  setSel: (s: Selection) => void;
  onAdd: (path: Path, index: number, t: StepType) => void;
  narrow: boolean;
  problems: Problems;
  allowed: StepType[];
}

function Line({ h = 24 }: { h?: number }) {
  return <Box sx={{ width: 2, height: h, bgcolor: tokens.line, flex: "none" }} />;
}

function Node({ color, icon, title, text, selected, onClick, dashed, error }: { color: string; icon: React.ReactNode; title: string; text: string; selected: boolean; onClick: () => void; dashed?: boolean; error?: boolean }) {
  const edge = error ? tokens.red : selected ? tokens.primary : tokens.divider;
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={`${title}: ${text}${error ? " (needs fixing)" : ""}`}
      sx={{
        width: 300, maxWidth: "calc(100vw - 48px)", display: "flex", gap: 1.25, alignItems: "center", textAlign: "left", font: "inherit", color: "inherit",
        bgcolor: "background.paper", borderRadius: "8px", p: 1.25, cursor: "pointer", flex: "none", position: "relative",
        border: `1px ${dashed && !error ? "dashed" : "solid"} ${edge}`,
        boxShadow: selected ? `0 0 0 3px color-mix(in srgb, ${error ? tokens.red : tokens.primary} 30%, transparent)` : `0 1px 2px ${tokens.shadow}`,
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
      {steps.map((s, i) => (
        <Box key={s.id} sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Node
            color={STEP_COLOR[s.type]}
            icon={STEP_ICON[s.type]}
            title={stepTitle(s)}
            text={stepSummary(s)}
            selected={ctx.sel?.kind === "step" && ctx.sel.id === s.id}
            error={!!ctx.problems[s.id]}
            onClick={() => ctx.setSel({ kind: "step", id: s.id })}
          />
          {s.type === "branch" && <BranchPaths step={s} ctx={ctx} />}
          <AddButton onPick={(t) => ctx.onAdd(path, i + 1, t)} allowed={ctx.allowed} />
        </Box>
      ))}
    </>
  );
}

/**
 * The fork and the join. Each lane draws half of the horizontal rule at its
 * top and bottom (the first lane its right half, the last its left), so the
 * rules always meet at the lanes' centre lines whatever their widths. A
 * stretching line at the foot of each lane carries the shorter one down to
 * the join.
 */
function BranchPaths({ step, ctx }: { step: Extract<Step, { type: "branch" }>; ctx: StepCtx }) {
  const lanes = ["yes", "no"] as const;
  if (ctx.narrow) {
    // Side by side doesn't fit a phone: stack Yes above No, each marked by a rail.
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {lanes.map((side) => (
          <Box key={side} sx={{ display: "flex", flexDirection: "column", alignItems: "center", borderLeft: `3px solid ${side === "yes" ? tokens.green : tokens.outline}`, pl: 1.5, ml: 1.5, mt: 1 }}>
            <LaneLabel side={side} />
            <StepList steps={step[side]} path={`${step.id}:${side}`} ctx={ctx} />
          </Box>
        ))}
      </Box>
    );
  }
  const rule = (i: number) => ({
    content: '""', position: "absolute", height: 2, bgcolor: tokens.line,
    left: i === 0 ? "50%" : 0, right: i === lanes.length - 1 ? "50%" : 0,
  });
  return (
    <>
      <Line h={20} />
      <Box sx={{ display: "flex", alignItems: "stretch" }}>
        {lanes.map((side, i) => (
          <Box
            key={side}
            sx={{
              position: "relative", display: "flex", flexDirection: "column", alignItems: "center", px: 2.5, minWidth: 300,
              "&::before": { ...rule(i), top: 0 },
              "&::after": { ...rule(i), bottom: 0 },
            }}
          >
            <Line h={16} />
            <LaneLabel side={side} />
            <StepList steps={step[side]} path={`${step.id}:${side}`} ctx={ctx} />
            <Box sx={{ flex: 1, width: 2, minHeight: 12, bgcolor: tokens.line }} />
          </Box>
        ))}
      </Box>
    </>
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
    <Box sx={{ width: 420, maxWidth: "calc(100vw - 48px)", mt: 4, bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", p: 1.5 }}>
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

function SettingsTab({ wf, onChange, onDelete }: { wf: Workflow; onChange: (p: Partial<Workflow>, key?: string) => void; onDelete: () => void }) {
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
        <Box sx={{ ...card, display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography sx={{ fontWeight: 600 }}>Stop early when</Typography>
          <ExitsEditor exits={wf.exits} onChange={(exits) => onChange({ exits })} />
        </Box>
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

const SAMPLE_PEOPLE = ["Thandi Mokoena", "Pieter van der Merwe", "Lerato Khumalo", "Ahmed Suleman", "Jessica Botha", "Sipho Nkosi"];
const HISTORY_STATUSES = ["Sent", "Opened", "Waiting", "Stopped early", "Failed"] as const;
const HISTORY_KEYS = ["lead", "step", "status", "when"] as const;
type HistoryKey = (typeof HISTORY_KEYS)[number];

/** One table: each lead that went through, the step it's on or last ran,
 *  and how that went. SAMPLE rows until the backend records real runs. */
function HistoryTab({ wf }: { wf: Workflow }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const { sort, onSort } = useTableSort<HistoryKey>("estatekit_workflow_history_sort", { k: "when", dir: "desc" }, HISTORY_KEYS);
  const rows = useMemo(() => {
    const actions: Step[] = [];
    const walk = (l: Step[]) => l.forEach((s) => { if (s.type === "branch") { walk(s.yes); walk(s.no); } else if (s.type !== "wait") actions.push(s); });
    walk(wf.steps);
    const now = Date.now();
    return SAMPLE_PEOPLE.map((name, i) => ({
      id: name,
      lead: name,
      step: actions.length ? stepTitle(actions[i % actions.length]) : "—",
      status: HISTORY_STATUSES[i % HISTORY_STATUSES.length] as string,
      when: new Date(now - (i * 7 + 2) * 3600_000).toISOString(),
    }));
  }, [wf.steps]);
  const needle = q.trim().toLowerCase();
  const shown = sortRows(
    rows.filter((r) => (!needle || r.lead.toLowerCase().includes(needle)) && (status === "all" || r.status === status)),
    (r) => r[sort.k],
    sort.dir,
  );
  return (
    <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
      <Box sx={{ maxWidth: 1000, mx: "auto" }}>
        <Typography component="div" sx={{ fontSize: 13.5, color: "text.secondary", mb: 2 }}>
          Every lead that went through this workflow, and the last thing it did for them.
          <Chip size="small" label="Sample rows" color="warning" variant="outlined" sx={{ ml: 1, height: 20, fontSize: 11 }} />
        </Typography>
        <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
          <TextField size="small" placeholder="Find a lead" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: 1, minWidth: 180 }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          <TextField select size="small" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ width: 190 }} aria-label="Status">
            <MenuItem value="all">All statuses</MenuItem>
            {HISTORY_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
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
                  <TableCell sx={{ fontWeight: 500, fontSize: 13.5, whiteSpace: "nowrap" }}>{r.lead}</TableCell>
                  <TableCell sx={{ fontSize: 13 }}>{r.step}</TableCell>
                  <TableCell>
                    <Chip size="small" label={r.status} variant="outlined" color={r.status === "Sent" || r.status === "Opened" ? "success" : r.status === "Failed" ? "error" : r.status === "Waiting" ? "primary" : "default"} sx={{ height: 22, fontSize: 12 }} />
                  </TableCell>
                  <TableCell sx={{ fontSize: 13, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {new Date(r.when).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                </TableRow>
              ))}
              {!shown.length && (
                <TableRow><TableCell colSpan={4} sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>No leads match.</TableCell></TableRow>
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
          {STAGES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
      )}
      {t.kind === "no_answer_times" && <NumberField label="Missed calls" value={t.count ?? 2} min={1} max={20} onChange={(count) => onChange({ ...t, count })} />}
      {t.kind === "not_contacted_for" && <NumberField label="Days without contact" value={t.days ?? 14} min={1} max={365} onChange={(days) => onChange({ ...t, days })} />}
      {t.kind === "daily_at" && (
        <TextField size="small" type="time" label="Time (SAST)" value={t.time ?? "16:00"} onChange={(e) => onChange({ ...t, time: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
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
              {meta.options().map((o) => <MenuItem key={o.v} value={o.v}>{o.l}</MenuItem>)}
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

/** A message box whose field buttons insert at the cursor, not at the end. */
function MessageField({ label, value, onChange, fields, minRows }: { label: string; value: string; onChange: (v: string) => void; fields: readonly string[]; minRows: number }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const pending = useRef<number | null>(null);
  useEffect(() => {
    if (pending.current === null || !ref.current) return;
    const at = pending.current;
    pending.current = null;
    ref.current.focus();
    ref.current.setSelectionRange(at, at);
  }, [value]);
  const insert = (f: string) => {
    const token = `{{${f}}}`;
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    pending.current = start + token.length;
    onChange(value.slice(0, start) + token + value.slice(end));
  };
  return (
    <>
      <TextField size="small" multiline minRows={minRows} label={label} value={value} onChange={(e) => onChange(e.target.value)} inputRef={ref} />
      <Box sx={{ mt: -1 }}>
        <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>Insert a field where the cursor is</Typography>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {fields.map((f) => (
            <Chip
              key={f}
              size="small"
              variant="outlined"
              label={`{{${f}}}`}
              // Keep the cursor in the box: a click would otherwise blur it first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(f)}
              sx={{ fontSize: 11, height: 24 }}
            />
          ))}
        </Box>
      </Box>
    </>
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
          <MessageField label="Message to the agent" value={step.text} onChange={(text) => onChange({ text }, "text")} fields={fieldsFor("whatsapp_agent", trigger)} minRows={4} />
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Sent from the EstateKit WhatsApp number to the agent's own. Put {"{{action_link}}"} in so they can call and log it in one tap.</Typography>
        </>
      );
    case "email_lead":
      return (
        <>
          <TextField size="small" label="Subject" value={step.subject} onChange={(e) => onChange({ subject: e.target.value }, "subject")} />
          <MessageField label="Email" value={step.body} onChange={(body) => onChange({ body }, "body")} fields={fieldsFor("email_lead", trigger)} minRows={7} />
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>From the agent's name; replies go to the agent's email. Skipped for leads without an email address. Opens are tracked.</Typography>
        </>
      );
    case "set_stage":
      return (
        <TextField select size="small" label="Move lead to" value={step.stage} onChange={(e) => onChange({ stage: e.target.value })}>
          {STAGES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
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
      const options = step.check === "stage_is" ? STAGES : step.check === "has_tag" ? KNOWN_TAGS : step.check === "source_is" ? SOURCES : step.check === "pipeline_is" ? PIPELINES : [];
      return (
        <>
          <TextField select size="small" label="Check" value={step.check} onChange={(e) => { const check = e.target.value as BranchCheck; onChange({ check, value: defaultBranchValue(check) }); }}>
            {BRANCH_CHECKS.map((x) => <MenuItem key={x.check} value={x.check}>{x.label}</MenuItem>)}
          </TextField>
          {meta?.needsValue && (
            <TextField select size="small" label={branchLabel(step.check)} value={step.value} onChange={(e) => onChange({ value: e.target.value })}>
              {options.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
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
function EmailPreview({ subject, body }: { subject: string; body: string }) {
  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", fontSize: 13 }}>
      <Box sx={{ bgcolor: tokens.surface2, px: 1.5, py: 1, borderBottom: `1px solid ${tokens.divider}` }}>
        <Box><Box component="span" sx={{ color: "text.secondary" }}>From:</Box> Megan Demo</Box>
        <Box><Box component="span" sx={{ color: "text.secondary" }}>To:</Box> thandi@example.com</Box>
        <Box sx={{ fontWeight: 600, mt: 0.5 }}>{fill(subject) || "(no subject)"}</Box>
      </Box>
      <Box sx={{ p: 1.5, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{fill(body) || <Box component="span" sx={{ color: "text.disabled" }}>Nothing written yet</Box>}</Box>
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
          : t.kind === "no_answer_times" ? <>Agent logs "No answer" for {first} the {ordinal(t.count ?? 1)} time</>
            : t.kind === "not_contacted_for" ? <>{first} hasn't been called or moved for {unitLabel(t.days ?? 14, "days")}</>
              : t.kind === "plan_opened" ? <>{first} opens the Marketing Plan link</>
                : t.kind === "reminder_due" ? <>A reminder for {first} comes due</>
                  : <>It's a weekday and the clock hits {t.time || "16:00"}</>;
    body = (
      <>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", fontSize: 13.5 }}><BoltIcon sx={{ fontSize: 18, color: tokens.primary }} />{event}</Box>
        <Arrow label={t.kind === "daily_at" ? "This workflow runs once for each agent" : "This workflow starts for that lead"} />
        {t.kind !== "daily_at" && <LeadRowMock stage={t.kind === "stage_changed" ? t.stage ?? "New Lead" : t.kind === "no_answer_times" ? "No Answer" : t.kind === "lead_created" ? "New Lead" : "Contacted"} highlight={t.kind === "stage_changed" ? "stage" : undefined} />}
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
            <WhatsAppPreview lead={SAMPLE_LEAD} text={step.text || " "} sampleFields={SAMPLE_FIELDS} />
          </>
        );
        break;
      case "email_lead":
        body = (
          <>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Lands in {first}'s inbox:</Typography>
            <EmailPreview subject={step.subject} body={step.body} />
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
        const yesLabel = step.check === "opened_last_email" ? "She opened it" : step.check === "has_email" ? "She has an email" : `${meta?.label} ${step.value || "…"}`;
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
