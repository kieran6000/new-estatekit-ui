import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Switch,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import BoltIcon from "@mui/icons-material/Bolt";
import ScheduleIcon from "@mui/icons-material/Schedule";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import EmailIcon from "@mui/icons-material/Email";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import FlagIcon from "@mui/icons-material/Flag";
import AlarmIcon from "@mui/icons-material/Alarm";
import NotificationsIcon from "@mui/icons-material/Notifications";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import BlockIcon from "@mui/icons-material/Block";
import CloseIcon from "@mui/icons-material/Close";
import { tokens } from "../theme";
import { PIPELINE_STAGES } from "../types";

// Workflow builder: trigger → (only if) → steps, with waits and if/else
// branches, like Zapier / GoHighLevel. Replaces the fixed presets on the
// Setup tab once it's wired up.
//
// UI ONLY FOR NOW: workflows live in this component's state and Save is off.
// Backend plan (add-only): `workflows` (trigger json, filters json, exits json,
// enabled) + `workflow_steps` (parent_id, branch 'yes'|'no'|null, order, type,
// config json). run-automations already does "wait N minutes, then act" per
// step; it grows a step-type switch, branch walking, and the exit checks.
// The existing automations become workflows built from the templates below.

// ── Model ────────────────────────────────────────────────────────────────

type TriggerKind =
  | "lead_created" | "stage_changed" | "no_answer_times" | "not_contacted_for"
  | "reminder_due" | "email_opened" | "email_clicked" | "plan_opened" | "daily_at";

interface Trigger { kind: TriggerKind; stage?: string; count?: number; days?: number; time?: string }

type Unit = "minutes" | "hours" | "days";

type Step =
  | { id: string; type: "wait"; amount: number; unit: Unit; workHoursOnly: boolean }
  | { id: string; type: "whatsapp"; to: "agent" | "lead"; text: string }
  | { id: string; type: "email"; to: "lead" | "agent"; subject: string; body: string }
  | { id: string; type: "notify"; text: string }
  | { id: string; type: "set_stage"; stage: string }
  | { id: string; type: "reminder"; label: string; inDays: number }
  | { id: string; type: "tag"; tag: string }
  | { id: string; type: "branch"; check: BranchCheck; value: string; yes: Step[]; no: Step[] };

type BranchCheck = "stage_is" | "email_opened" | "has_email" | "lead_source" | "answer_contains";

interface Filter { field: "pipeline" | "source" | "stage" | "has_email"; value: string }

interface Exit { kind: "stage_changed" | "booked" | "lead_replied" | "marked_lost"; on: boolean }

interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  filters: Filter[];
  steps: Step[];
  exits: Exit[];
}

const TRIGGERS: { kind: TriggerKind; label: string; help: string }[] = [
  { kind: "lead_created", label: "New lead comes in", help: "From a Facebook form or an EstateKit page." },
  { kind: "stage_changed", label: "Lead moves to a stage", help: "e.g. No Answer, Contacted, Booked." },
  { kind: "no_answer_times", label: "No answer, N times", help: "After the agent logs 'No answer' this many times." },
  { kind: "not_contacted_for", label: "Not contacted for N days", help: "Leads that went quiet." },
  { kind: "reminder_due", label: "A follow-up reminder is due", help: "When the reminder time arrives." },
  { kind: "email_opened", label: "Lead opens an email", help: "Any email this lead got from us." },
  { kind: "email_clicked", label: "Lead clicks a link in an email", help: "" },
  { kind: "plan_opened", label: "Lead opens their Marketing Plan", help: "The /plan link in the confirmation email." },
  { kind: "daily_at", label: "Every weekday at a set time", help: "One run per agent, not per lead (the 16:00 digest)." },
];

const STEP_TYPES: { type: Step["type"]; label: string; icon: React.ReactNode; help: string }[] = [
  { type: "wait", label: "Wait", icon: <ScheduleIcon />, help: "Pause before the next step" },
  { type: "whatsapp", label: "Send WhatsApp", icon: <WhatsAppIcon />, help: "To the agent or the lead" },
  { type: "email", label: "Send email", icon: <EmailIcon />, help: "To the lead, from the agent" },
  { type: "branch", label: "If / else", icon: <CallSplitIcon />, help: "Split on a condition" },
  { type: "notify", label: "Alert the agent", icon: <NotificationsIcon />, help: "Push + WhatsApp nudge" },
  { type: "set_stage", label: "Move stage", icon: <FlagIcon />, help: "Change the lead's stage" },
  { type: "reminder", label: "Set reminder", icon: <AlarmIcon />, help: "Puts it on the agent's list" },
  { type: "tag", label: "Add tag", icon: <LocalOfferIcon />, help: "Label the lead" },
];

const EXIT_LABEL: Record<Exit["kind"], string> = {
  stage_changed: "The lead's stage changes",
  booked: "An appointment is booked",
  lead_replied: "The lead replies (WhatsApp or email)",
  marked_lost: "The lead is marked Lost or Invalid",
};

const BRANCH_LABEL: Record<BranchCheck, string> = {
  stage_is: "Lead's stage is",
  email_opened: "Opened the last email",
  has_email: "Lead has an email address",
  lead_source: "Lead came from",
  answer_contains: "A form answer contains",
};

const STAGES = Array.from(new Set([...PIPELINE_STAGES.seller, ...PIPELINE_STAGES.buyer]));

let seq = 0;
const nid = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

const DEFAULT_EXITS = (): Exit[] => [
  { kind: "stage_changed", on: true },
  { kind: "booked", on: true },
  { kind: "lead_replied", on: true },
  { kind: "marked_lost", on: true },
];

function newStep(type: Step["type"]): Step {
  const id = nid();
  switch (type) {
    case "wait": return { id, type, amount: 1, unit: "days", workHoursOnly: true };
    case "whatsapp": return { id, type, to: "agent", text: "" };
    case "email": return { id, type, to: "lead", subject: "", body: "" };
    case "notify": return { id, type, text: "" };
    case "set_stage": return { id, type, stage: "Contacted" };
    case "reminder": return { id, type, label: "Follow up", inDays: 2 };
    case "tag": return { id, type, tag: "" };
    case "branch": return { id, type, check: "email_opened", value: "", yes: [], no: [] };
  }
}

// ── Templates (also what today's presets turn into) ─────────────────────

const TEMPLATES: { name: string; blurb: string; make: () => Workflow }[] = [
  {
    name: "No answer → email sequence",
    blurb: "Two missed calls, then 3 emails over a week. Stops when they reply or book.",
    make: () => ({
      id: nid(), name: "No answer → email sequence", enabled: false,
      trigger: { kind: "no_answer_times", count: 2 },
      filters: [{ field: "has_email", value: "yes" }],
      exits: DEFAULT_EXITS(),
      steps: [
        { id: nid(), type: "wait", amount: 30, unit: "minutes", workHoursOnly: true },
        { id: nid(), type: "email", to: "lead", subject: "Sorry I missed you, {{first_name}}", body: "Hi {{first_name}},\n\nI tried calling about your home in {{area}}. When's a good time for a quick 5-minute chat?\n\n{{agent_name}}\n{{agent_phone}}" },
        { id: nid(), type: "wait", amount: 2, unit: "days", workHoursOnly: true },
        {
          id: nid(), type: "branch", check: "email_opened", value: "",
          yes: [
            { id: nid(), type: "notify", text: "{{first_name}} opened your email. Good moment to call: {{lead_link}}" },
          ],
          no: [
            { id: nid(), type: "email", to: "lead", subject: "What is your home worth right now?", body: "Hi {{first_name}},\n\nHomes like yours in {{area}} have been selling quickly. I'd be happy to give you a free, no-obligation valuation.\n\n{{agent_name}}" },
          ],
        },
        { id: nid(), type: "wait", amount: 4, unit: "days", workHoursOnly: true },
        { id: nid(), type: "email", to: "lead", subject: "Should I close your file?", body: "Hi {{first_name}},\n\nI haven't been able to reach you, so I'll assume now isn't the right time. If anything changes, just reply to this email.\n\n{{agent_name}}" },
        { id: nid(), type: "reminder", label: "Last try: call", inDays: 1 },
      ],
    }),
  },
  {
    name: "New lead: speed-to-lead",
    blurb: "Alert the agent now, nudge again at 10 and 60 minutes if nobody has called.",
    make: () => ({
      id: nid(), name: "New lead: speed-to-lead", enabled: true,
      trigger: { kind: "lead_created" },
      filters: [],
      exits: DEFAULT_EXITS(),
      steps: [
        { id: nid(), type: "whatsapp", to: "agent", text: "New lead: {{name}} ({{phone}}). Call now: {{lead_link}}" },
        { id: nid(), type: "wait", amount: 10, unit: "minutes", workHoursOnly: false },
        { id: nid(), type: "branch", check: "stage_is", value: "New Lead", yes: [{ id: nid(), type: "whatsapp", to: "agent", text: "{{first_name}} is still waiting for your call: {{lead_link}}" }], no: [] },
        { id: nid(), type: "wait", amount: 60, unit: "minutes", workHoursOnly: true },
        { id: nid(), type: "branch", check: "stage_is", value: "New Lead", yes: [{ id: nid(), type: "reminder", label: "Call {{first_name}}", inDays: 0 }], no: [] },
      ],
    }),
  },
  {
    name: "Gone quiet: re-engage",
    blurb: "Contacted but nothing for 14 days: one email, then a reminder for the agent.",
    make: () => ({
      id: nid(), name: "Gone quiet: re-engage", enabled: false,
      trigger: { kind: "not_contacted_for", days: 14 },
      filters: [{ field: "stage", value: "Contacted" }],
      exits: DEFAULT_EXITS(),
      steps: [
        { id: nid(), type: "email", to: "lead", subject: "Still thinking about selling, {{first_name}}?", body: "Hi {{first_name}},\n\nJust checking in. Happy to update your valuation whenever suits you.\n\n{{agent_name}}" },
        { id: nid(), type: "wait", amount: 3, unit: "days", workHoursOnly: true },
        { id: nid(), type: "reminder", label: "Call: re-engage", inDays: 0 },
      ],
    }),
  },
  {
    name: "Blank workflow",
    blurb: "Pick your own trigger and steps.",
    make: () => ({ id: nid(), name: "Untitled workflow", enabled: false, trigger: { kind: "lead_created" }, filters: [], exits: DEFAULT_EXITS(), steps: [] }),
  },
];

const MERGE_FIELDS = ["{{first_name}}", "{{name}}", "{{phone}}", "{{area}}", "{{stage}}", "{{agent_name}}", "{{agent_phone}}", "{{lead_link}}", "{{plan_link}}"];

// ── Tree helpers ─────────────────────────────────────────────────────────

function mapSteps(steps: Step[], fn: (s: Step) => Step | null): Step[] {
  const out: Step[] = [];
  for (const s of steps) {
    const r = fn(s);
    if (!r) continue;
    out.push(r.type === "branch" ? { ...r, yes: mapSteps(r.yes, fn), no: mapSteps(r.no, fn) } : r);
  }
  return out;
}

function findStep(steps: Step[], id: string): Step | undefined {
  for (const s of steps) {
    if (s.id === id) return s;
    if (s.type === "branch") {
      const f = findStep(s.yes, id) ?? findStep(s.no, id);
      if (f) return f;
    }
  }
  return undefined;
}

/** Insert `step` into the list identified by `path` ("root" or "<branchId>:yes|no") at `index`. */
function insertAt(steps: Step[], path: string, index: number, step: Step): Step[] {
  if (path === "root") return [...steps.slice(0, index), step, ...steps.slice(index)];
  const [bid, side] = path.split(":") as [string, "yes" | "no"];
  return steps.map((s) => {
    if (s.type !== "branch") return s;
    if (s.id === bid) return { ...s, [side]: [...s[side].slice(0, index), step, ...s[side].slice(index)] };
    return { ...s, yes: insertAt(s.yes, path, index, step), no: insertAt(s.no, path, index, step) };
  });
}

function countSteps(steps: Step[]): number {
  return steps.reduce((n, s) => n + 1 + (s.type === "branch" ? countSteps(s.yes) + countSteps(s.no) : 0), 0);
}

function triggerSummary(t: Trigger): string {
  switch (t.kind) {
    case "stage_changed": return `Lead moves to "${t.stage ?? "…"}"`;
    case "no_answer_times": return `No answer ${t.count ?? 1} time${(t.count ?? 1) === 1 ? "" : "s"}`;
    case "not_contacted_for": return `Not contacted for ${t.days ?? 7} days`;
    case "daily_at": return `Every weekday at ${t.time ?? "16:00"}`;
    default: return TRIGGERS.find((x) => x.kind === t.kind)?.label ?? t.kind;
  }
}

function stepSummary(s: Step): string {
  switch (s.type) {
    case "wait": return `Wait ${s.amount} ${s.amount === 1 ? s.unit.replace(/s$/, "") : s.unit}${s.workHoursOnly ? " (08:00–20:00 only)" : ""}`;
    case "whatsapp": return s.text || "(no message yet)";
    case "email": return s.subject || "(no subject yet)";
    case "notify": return s.text || "(no message yet)";
    case "set_stage": return `Move to ${s.stage}`;
    case "reminder": return `${s.label} · ${s.inDays === 0 ? "today" : `in ${s.inDays} day${s.inDays === 1 ? "" : "s"}`}`;
    case "tag": return s.tag ? `Tag "${s.tag}"` : "(no tag yet)";
    case "branch": return `${BRANCH_LABEL[s.check]}${s.check === "stage_is" || s.check === "lead_source" || s.check === "answer_contains" ? ` "${s.value || "…"}"` : ""}?`;
  }
}

function stepTitle(s: Step): string {
  if (s.type === "whatsapp") return `WhatsApp to ${s.to}`;
  if (s.type === "email") return `Email to ${s.to}`;
  return STEP_TYPES.find((x) => x.type === s.type)?.label ?? s.type;
}

const STEP_COLOR: Record<Step["type"], string> = {
  wait: "#757575", whatsapp: "#1da851", email: "#1565c0", notify: "#e65100",
  set_stage: "#6a1b9a", reminder: "#ad1457", tag: "#00838f", branch: "#37474f",
};

// ── Component ───────────────────────────────────────────────────────────

type Selection = { kind: "trigger" } | { kind: "filters" } | { kind: "exits" } | { kind: "step"; id: string } | null;

export default function WorkflowBuilder() {
  const isDesktop = useMediaQuery("(min-width:1000px)");
  const [workflows, setWorkflows] = useState<Workflow[]>(() => [TEMPLATES[1].make(), TEMPLATES[0].make()]);
  const [activeId, setActiveId] = useState(workflows[0].id);
  const [sel, setSel] = useState<Selection>(null);
  const [picker, setPicker] = useState(false);
  const wf = workflows.find((w) => w.id === activeId) ?? workflows[0];

  const update = (patch: Partial<Workflow> | ((w: Workflow) => Workflow)) =>
    setWorkflows((all) => all.map((w) => (w.id !== wf.id ? w : typeof patch === "function" ? patch(w) : { ...w, ...patch })));

  const updateStep = (id: string, patch: Partial<Step>) =>
    update((w) => ({ ...w, steps: mapSteps(w.steps, (s) => (s.id === id ? ({ ...s, ...patch } as Step) : s)) }));
  const removeStep = (id: string) => {
    update((w) => ({ ...w, steps: mapSteps(w.steps, (s) => (s.id === id ? null : s)) }));
    setSel(null);
  };
  const addStep = (path: string, index: number, type: Step["type"]) => {
    const s = newStep(type);
    update((w) => ({ ...w, steps: insertAt(w.steps, path, index, s) }));
    setSel({ kind: "step", id: s.id });
  };

  const selectedStep = sel?.kind === "step" ? findStep(wf.steps, sel.id) : undefined;
  const panelOpen = !!sel && (sel.kind !== "step" || !!selectedStep);

  const panel = panelOpen && (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography sx={{ fontWeight: 600, flex: 1 }}>
          {sel?.kind === "trigger" ? "Trigger" : sel?.kind === "filters" ? "Only run if" : sel?.kind === "exits" ? "Stop when" : selectedStep ? stepTitle(selectedStep) : ""}
        </Typography>
        <IconButton size="small" onClick={() => setSel(null)} aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
      </Box>
      {sel?.kind === "trigger" && <TriggerEditor t={wf.trigger} onChange={(trigger) => update({ trigger })} />}
      {sel?.kind === "filters" && <FiltersEditor filters={wf.filters} onChange={(filters) => update({ filters })} />}
      {sel?.kind === "exits" && <ExitsEditor exits={wf.exits} onChange={(exits) => update({ exits })} />}
      {selectedStep && <StepEditor step={selectedStep} onChange={(p) => updateStep(selectedStep.id, p)} onDelete={() => removeStep(selectedStep.id)} />}
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "calc(100vh - 100px)", alignItems: "stretch" }}>
      {/* Workflow list */}
      {isDesktop && (
        <Box sx={{ width: 250, flex: "none", borderRight: `1px solid ${tokens.divider}`, bgcolor: "background.paper" }}>
          <Box sx={{ p: 1.5 }}>
            <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={() => setPicker(true)}>New workflow</Button>
          </Box>
          <List dense disablePadding>
            {workflows.map((w) => (
              <ListItemButton key={w.id} selected={w.id === wf.id} onClick={() => { setActiveId(w.id); setSel(null); }}>
                <ListItemText
                  primary={w.name}
                  secondary={`${triggerSummary(w.trigger)} · ${countSteps(w.steps)} steps`}
                  slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 500 } }, secondary: { sx: { fontSize: 12 } } }}
                />
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: w.enabled ? "success.main" : tokens.divider, ml: 1, flex: "none" }} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      )}

      {/* Canvas */}
      <Box sx={{ flex: 1, minWidth: 0, bgcolor: tokens.bg, overflowX: "auto" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.5, bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, flexWrap: "wrap" }}>
          {!isDesktop && (
            <TextField select size="small" value={wf.id} onChange={(e) => { setActiveId(e.target.value); setSel(null); }} sx={{ minWidth: 180 }}>
              {workflows.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </TextField>
          )}
          <TextField
            size="small"
            value={wf.name}
            onChange={(e) => update({ name: e.target.value })}
            sx={{ flex: 1, minWidth: 180, "& input": { fontWeight: 600 } }}
            aria-label="Workflow name"
          />
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{wf.enabled ? "On" : "Off"}</Typography>
            <Switch checked={wf.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
          </Box>
          {!isDesktop && <Button size="small" startIcon={<AddIcon />} onClick={() => setPicker(true)}>New</Button>}
          <Tooltip title="Preview only: saving comes with the backend">
            <span><Button variant="contained" size="small" disabled>Save</Button></span>
          </Tooltip>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 3, px: 2, minWidth: "fit-content" }}>
          <Node
            color="#1976d2"
            icon={<BoltIcon />}
            title="When"
            text={triggerSummary(wf.trigger)}
            selected={sel?.kind === "trigger"}
            onClick={() => setSel({ kind: "trigger" })}
          />
          <Connector />
          <Node
            color="#546e7a"
            icon={<FilterAltIcon />}
            title="Only if"
            text={wf.filters.length ? wf.filters.map(filterSummary).join(" · ") : "Every lead (no filters)"}
            selected={sel?.kind === "filters"}
            onClick={() => setSel({ kind: "filters" })}
            dashed={!wf.filters.length}
          />
          <StepList steps={wf.steps} path="root" sel={sel} setSel={setSel} onAdd={addStep} />
          <Connector />
          <Node
            color="#b71c1c"
            icon={<BlockIcon />}
            title="Stop early when"
            text={wf.exits.filter((x) => x.on).map((x) => EXIT_LABEL[x.kind]).join(" · ") || "Never (runs every step)"}
            selected={sel?.kind === "exits"}
            onClick={() => setSel({ kind: "exits" })}
          />
          <Timeline wf={wf} />
        </Box>
      </Box>

      {/* Editor panel */}
      {isDesktop ? (
        panelOpen && (
          <Box sx={{ width: 360, flex: "none", borderLeft: `1px solid ${tokens.divider}`, bgcolor: "background.paper", overflowY: "auto" }}>{panel}</Box>
        )
      ) : (
        <Drawer anchor="bottom" open={panelOpen} onClose={() => setSel(null)} slotProps={{ paper: { sx: { maxHeight: "85vh", borderRadius: "12px 12px 0 0" } } }}>
          {panel}
        </Drawer>
      )}

      <Dialog open={picker} onClose={() => setPicker(false)} fullWidth maxWidth="sm">
        <DialogTitle>Start from a template</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {TEMPLATES.map((t) => (
            <Box
              key={t.name}
              role="button"
              tabIndex={0}
              onClick={() => {
                const w = t.make();
                setWorkflows((all) => [...all, w]);
                setActiveId(w.id);
                setSel(null);
                setPicker(false);
              }}
              sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "4px", p: 1.5, cursor: "pointer", "&:hover": { borderColor: "primary.main", bgcolor: tokens.hover } }}
            >
              <Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>{t.name}</Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{t.blurb}</Typography>
            </Box>
          ))}
        </DialogContent>
      </Dialog>
    </Box>
  );
}

function filterSummary(f: Filter): string {
  if (f.field === "has_email") return f.value === "yes" ? "Has an email" : "No email";
  return `${f.field === "pipeline" ? "Pipeline" : f.field === "source" ? "Source" : "Stage"}: ${f.value || "…"}`;
}

// ── Canvas pieces ───────────────────────────────────────────────────────

function Connector() {
  return <Box sx={{ width: 2, height: 22, bgcolor: "#b0b7bf" }} />;
}

function Node({ color, icon, title, text, selected, onClick, dashed }: { color: string; icon: React.ReactNode; title: string; text: string; selected: boolean; onClick: () => void; dashed?: boolean }) {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      sx={{
        width: 300, maxWidth: "100%", display: "flex", gap: 1.25, alignItems: "flex-start",
        bgcolor: "background.paper", borderRadius: "6px", p: 1.25, cursor: "pointer",
        border: `${selected ? 2 : 1}px ${dashed ? "dashed" : "solid"} ${selected ? "#1976d2" : tokens.divider}`,
        borderLeft: `4px solid ${color}`,
        boxShadow: selected ? "0 2px 8px rgba(25,118,210,.25)" : "0 1px 2px rgba(0,0,0,.06)",
      }}
    >
      <Box sx={{ color, display: "flex", mt: "1px", "& svg": { fontSize: 20 } }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "text.secondary" }}>{title}</Typography>
        <Typography sx={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{text}</Typography>
      </Box>
    </Box>
  );
}

function AddButton({ onPick }: { onPick: (t: Step["type"]) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Connector />
      <IconButton
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label="Add a step"
        sx={{ width: 28, height: 28, border: `1px solid #b0b7bf`, bgcolor: "background.paper", "&:hover": { bgcolor: tokens.hover, borderColor: "primary.main" } }}
      >
        <AddIcon sx={{ fontSize: 18 }} />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {STEP_TYPES.map((t) => (
          <MenuItem key={t.type} onClick={() => { onPick(t.type); setAnchor(null); }} sx={{ gap: 1.5, minWidth: 240 }}>
            <Box sx={{ color: STEP_COLOR[t.type], display: "flex" }}>{t.icon}</Box>
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

function StepList({ steps, path, sel, setSel, onAdd }: { steps: Step[]; path: string; sel: Selection; setSel: (s: Selection) => void; onAdd: (path: string, index: number, t: Step["type"]) => void }) {
  // Side by side doesn't fit a phone: stack Yes above No there instead.
  const narrow = useMediaQuery("(max-width:700px)");
  return (
    <>
      <AddButton onPick={(t) => onAdd(path, 0, t)} />
      {steps.map((s, i) => (
        <Box key={s.id} sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Connector />
          <Node
            color={STEP_COLOR[s.type]}
            icon={STEP_TYPES.find((x) => x.type === s.type)?.icon}
            title={stepTitle(s)}
            text={stepSummary(s)}
            selected={sel?.kind === "step" && sel.id === s.id}
            onClick={() => setSel({ kind: "step", id: s.id })}
          />
          {s.type === "branch" && (
            <Box sx={{ display: "flex", flexDirection: narrow ? "column" : "row", gap: narrow ? 0 : 3, alignItems: narrow ? "center" : "flex-start", mt: 0 }}>
              {(["yes", "no"] as const).map((side) => (
                <Box key={side} sx={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: narrow ? 0 : 300, ...(narrow && { borderLeft: `3px solid ${side === "yes" ? "#2e7d32" : "#bdbdbd"}`, pl: 1.5, ml: 1.5 }) }}>
                  <Connector />
                  <Chip size="small" label={side === "yes" ? "Yes" : "No"} color={side === "yes" ? "success" : "default"} />
                  <StepList steps={s[side]} path={`${s.id}:${side}`} sel={sel} setSel={setSel} onAdd={onAdd} />
                  {!s[side].length && <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>Then carry on</Typography>}
                </Box>
              ))}
            </Box>
          )}
          <AddButton onPick={(t) => onAdd(path, i + 1, t)} />
        </Box>
      ))}
    </>
  );
}

/** "How this plays out": the main path laid out in time, so the delays make sense at a glance. */
function Timeline({ wf }: { wf: Workflow }) {
  const rows = useMemo(() => {
    let mins = 0;
    const out: { at: string; what: string }[] = [];
    const fmt = (m: number) => (m === 0 ? "Straight away" : m < 60 ? `+${m} min` : m < 1440 ? `+${Math.round(m / 60)} h` : `Day ${Math.round(m / 1440)}`);
    for (const s of wf.steps) {
      if (s.type === "wait") { mins += s.amount * (s.unit === "minutes" ? 1 : s.unit === "hours" ? 60 : 1440); continue; }
      out.push({ at: fmt(mins), what: s.type === "branch" ? `Check: ${stepSummary(s)}` : `${stepTitle(s)}: ${stepSummary(s)}` });
    }
    return out;
  }, [wf]);
  if (!rows.length) return null;
  return (
    <Box sx={{ width: 420, maxWidth: "100%", mt: 4, bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "6px", p: 1.5 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "text.secondary", mb: 1 }}>How this plays out for one lead</Typography>
      {rows.map((r, i) => (
        <Box key={i} sx={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 1, fontSize: 13, py: 0.5, borderTop: i ? `1px solid ${tokens.divider2}` : 0 }}>
          <Box sx={{ color: "text.secondary", fontWeight: 500 }}>{r.at}</Box>
          <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.what}</Box>
        </Box>
      ))}
      <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>Stops early if any "Stop early when" rule happens.</Typography>
    </Box>
  );
}

// ── Editors ─────────────────────────────────────────────────────────────

function TriggerEditor({ t, onChange }: { t: Trigger; onChange: (t: Trigger) => void }) {
  const meta = TRIGGERS.find((x) => x.kind === t.kind);
  return (
    <>
      <TextField select size="small" label="Start this workflow when" value={t.kind} onChange={(e) => onChange({ kind: e.target.value as TriggerKind })}>
        {TRIGGERS.map((x) => <MenuItem key={x.kind} value={x.kind}>{x.label}</MenuItem>)}
      </TextField>
      {meta?.help && <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: -1 }}>{meta.help}</Typography>}
      {t.kind === "stage_changed" && (
        <TextField select size="small" label="Stage" value={t.stage ?? ""} onChange={(e) => onChange({ ...t, stage: e.target.value })}>
          {STAGES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
      )}
      {t.kind === "no_answer_times" && (
        <TextField size="small" type="number" label="Number of missed calls" value={t.count ?? 1} onChange={(e) => onChange({ ...t, count: Math.max(1, Number(e.target.value)) })} />
      )}
      {t.kind === "not_contacted_for" && (
        <TextField size="small" type="number" label="Days without contact" value={t.days ?? 7} onChange={(e) => onChange({ ...t, days: Math.max(1, Number(e.target.value)) })} />
      )}
      {t.kind === "daily_at" && (
        <TextField size="small" type="time" label="Time (SAST)" value={t.time ?? "16:00"} onChange={(e) => onChange({ ...t, time: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
      )}
    </>
  );
}

function FiltersEditor({ filters, onChange }: { filters: Filter[]; onChange: (f: Filter[]) => void }) {
  return (
    <>
      <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Leads must match all of these. Leave empty to run for every lead.</Typography>
      {filters.map((f, i) => (
        <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <TextField select size="small" value={f.field} onChange={(e) => onChange(filters.map((x, j) => (j === i ? { field: e.target.value as Filter["field"], value: e.target.value === "has_email" ? "yes" : "" } : x)))} sx={{ width: 140 }}>
            <MenuItem value="pipeline">Pipeline</MenuItem>
            <MenuItem value="source">Source</MenuItem>
            <MenuItem value="stage">Stage</MenuItem>
            <MenuItem value="has_email">Email</MenuItem>
          </TextField>
          {f.field === "has_email" ? (
            <TextField select size="small" value={f.value} onChange={(e) => onChange(filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} sx={{ flex: 1 }}>
              <MenuItem value="yes">Has an email</MenuItem>
              <MenuItem value="no">No email</MenuItem>
            </TextField>
          ) : f.field === "stage" ? (
            <TextField select size="small" value={f.value} onChange={(e) => onChange(filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} sx={{ flex: 1 }}>
              {STAGES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
          ) : f.field === "pipeline" ? (
            <TextField select size="small" value={f.value} onChange={(e) => onChange(filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} sx={{ flex: 1 }}>
              <MenuItem value="Sellers">Sellers</MenuItem>
              <MenuItem value="Buyers">Buyers</MenuItem>
            </TextField>
          ) : (
            <TextField select size="small" value={f.value} onChange={(e) => onChange(filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} sx={{ flex: 1 }}>
              <MenuItem value="Facebook form">Facebook form</MenuItem>
              <MenuItem value="EstateKit page">EstateKit page</MenuItem>
              <MenuItem value="Added by hand">Added by hand</MenuItem>
            </TextField>
          )}
          <IconButton size="small" onClick={() => onChange(filters.filter((_, j) => j !== i))} aria-label="Remove filter"><DeleteOutlineIcon fontSize="small" /></IconButton>
        </Box>
      ))}
      <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...filters, { field: "stage", value: "" }])} sx={{ alignSelf: "flex-start" }}>Add filter</Button>
    </>
  );
}

function ExitsEditor({ exits, onChange }: { exits: Exit[]; onChange: (e: Exit[]) => void }) {
  return (
    <>
      <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
        The lead leaves the workflow as soon as one of these happens, so nobody gets a "still interested?" email after they've booked.
      </Typography>
      {exits.map((x, i) => (
        <Box key={x.kind} sx={{ display: "flex", alignItems: "center" }}>
          <Typography sx={{ flex: 1, fontSize: 14 }}>{EXIT_LABEL[x.kind]}</Typography>
          <Switch checked={x.on} onChange={(e) => onChange(exits.map((y, j) => (j === i ? { ...y, on: e.target.checked } : y)))} />
        </Box>
      ))}
    </>
  );
}

function MergeFields({ onInsert }: { onInsert: (f: string) => void }) {
  return (
    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: -1 }}>
      {MERGE_FIELDS.map((f) => <Chip key={f} size="small" variant="outlined" label={f} onClick={() => onInsert(f)} sx={{ fontSize: 11, height: 22 }} />)}
    </Box>
  );
}

function StepEditor({ step, onChange, onDelete }: { step: Step; onChange: (p: Partial<Step>) => void; onDelete: () => void }) {
  let body: React.ReactNode = null;
  switch (step.type) {
    case "wait":
      body = (
        <>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField size="small" type="number" label="Wait" value={step.amount} onChange={(e) => onChange({ amount: Math.max(0, Number(e.target.value)) })} sx={{ width: 110 }} />
            <TextField select size="small" value={step.unit} onChange={(e) => onChange({ unit: e.target.value as Unit })} sx={{ flex: 1 }}>
              <MenuItem value="minutes">minutes</MenuItem>
              <MenuItem value="hours">hours</MenuItem>
              <MenuItem value="days">days</MenuItem>
            </TextField>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography sx={{ flex: 1, fontSize: 14 }}>Only send between 08:00 and 20:00</Typography>
            <Switch checked={step.workHoursOnly} onChange={(e) => onChange({ workHoursOnly: e.target.checked })} />
          </Box>
        </>
      );
      break;
    case "whatsapp":
      body = (
        <>
          <TextField select size="small" label="Send to" value={step.to} onChange={(e) => onChange({ to: e.target.value as "agent" | "lead" })}>
            <MenuItem value="agent">The agent (nudge about this lead)</MenuItem>
            <MenuItem value="lead">The lead</MenuItem>
          </TextField>
          <TextField size="small" multiline minRows={4} label="Message" value={step.text} onChange={(e) => onChange({ text: e.target.value })} />
          <MergeFields onInsert={(f) => onChange({ text: step.text + f })} />
        </>
      );
      break;
    case "email":
      body = (
        <>
          <TextField select size="small" label="Send to" value={step.to} onChange={(e) => onChange({ to: e.target.value as "agent" | "lead" })}>
            <MenuItem value="lead">The lead (from the agent's name)</MenuItem>
            <MenuItem value="agent">The agent</MenuItem>
          </TextField>
          <TextField size="small" label="Subject" value={step.subject} onChange={(e) => onChange({ subject: e.target.value })} />
          <TextField size="small" multiline minRows={7} label="Email" value={step.body} onChange={(e) => onChange({ body: e.target.value })} />
          <MergeFields onInsert={(f) => onChange({ body: step.body + f })} />
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Skipped for leads without an email address. Opens and clicks are tracked.</Typography>
        </>
      );
      break;
    case "notify":
      body = (
        <>
          <TextField size="small" multiline minRows={3} label="Alert text" value={step.text} onChange={(e) => onChange({ text: e.target.value })} />
          <MergeFields onInsert={(f) => onChange({ text: step.text + f })} />
        </>
      );
      break;
    case "set_stage":
      body = (
        <TextField select size="small" label="Move lead to" value={step.stage} onChange={(e) => onChange({ stage: e.target.value })}>
          {STAGES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
      );
      break;
    case "reminder":
      body = (
        <>
          <TextField size="small" label="Reminder" value={step.label} onChange={(e) => onChange({ label: e.target.value })} helperText="Shows in the lead's Next column" />
          <TextField size="small" type="number" label="Due in (days, 0 = today)" value={step.inDays} onChange={(e) => onChange({ inDays: Math.max(0, Number(e.target.value)) })} />
        </>
      );
      break;
    case "tag":
      body = <TextField size="small" label="Tag" value={step.tag} onChange={(e) => onChange({ tag: e.target.value })} placeholder="e.g. cold, nurture, investor" />;
      break;
    case "branch":
      body = (
        <>
          <TextField select size="small" label="Check" value={step.check} onChange={(e) => onChange({ check: e.target.value as BranchCheck, value: "" })}>
            {(Object.keys(BRANCH_LABEL) as BranchCheck[]).map((k) => <MenuItem key={k} value={k}>{BRANCH_LABEL[k]}</MenuItem>)}
          </TextField>
          {step.check === "stage_is" && (
            <TextField select size="small" label="Stage" value={step.value} onChange={(e) => onChange({ value: e.target.value })}>
              {STAGES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
          )}
          {step.check === "lead_source" && (
            <TextField select size="small" label="Source" value={step.value} onChange={(e) => onChange({ value: e.target.value })}>
              <MenuItem value="Facebook form">Facebook form</MenuItem>
              <MenuItem value="EstateKit page">EstateKit page</MenuItem>
            </TextField>
          )}
          {step.check === "answer_contains" && <TextField size="small" label="Text" value={step.value} onChange={(e) => onChange({ value: e.target.value })} placeholder="e.g. As soon as possible" />}
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Add steps under Yes and No on the canvas. Both paths carry on to the steps below the split.</Typography>
        </>
      );
      break;
  }
  return (
    <>
      {body}
      <Divider />
      <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={onDelete} sx={{ alignSelf: "flex-start" }}>
        Delete step{step.type === "branch" ? " and its paths" : ""}
      </Button>
    </>
  );
}
