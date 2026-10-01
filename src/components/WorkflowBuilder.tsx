import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
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
import BoltIcon from "@mui/icons-material/Bolt";
import ScheduleIcon from "@mui/icons-material/Schedule";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import EmailIcon from "@mui/icons-material/Email";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import FlagIcon from "@mui/icons-material/Flag";
import AlarmIcon from "@mui/icons-material/Alarm";
import NotificationsIcon from "@mui/icons-material/Notifications";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import BlockIcon from "@mui/icons-material/Block";
import CloseIcon from "@mui/icons-material/Close";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import EditIcon from "@mui/icons-material/Edit";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { tokens } from "../theme";
import { PIPELINE_STAGES } from "../types";
import { useAutomations, useAutomationSteps } from "../hooks/useAutomations";
import type { AutomationRow, AutomationStepRow } from "../types/automations";
import WhatsAppPreview from "./WhatsAppPreview";

// Workflow builder: trigger → (only if) → steps, with waits and if/else
// branches, like Zapier / GoHighLevel. Will replace the fixed presets on the
// Setup tab once it's wired up.
//
// UI ONLY FOR NOW. Today's real automations (from the `automations` table)
// and the lead confirmation email are converted into workflows here, so you
// can see how they'd look; edits stay in this screen and Save is off.
// Backend plan (add-only): `workflows` (trigger, filters, exits, settings,
// status) + `workflow_steps` (parent_id, branch, order, type, config).
// run-automations already does "wait N minutes, then act" per step; it grows
// a step-type switch, branch walking and the stop-early checks.

// ── Model ────────────────────────────────────────────────────────────────

type TriggerKind =
  | "lead_created" | "stage_changed" | "no_answer_times" | "not_contacted_for"
  | "reminder_due" | "email_opened" | "email_clicked" | "plan_opened" | "daily_at";

interface Trigger { kind: TriggerKind; stage?: string; count?: number; days?: number; time?: string }

type Unit = "minutes" | "hours" | "days";

type Step =
  | { id: string; type: "wait"; amount: number; unit: Unit }
  | { id: string; type: "whatsapp"; to: "agent" | "lead"; text: string }
  | { id: string; type: "email"; to: "lead" | "agent"; subject: string; body: string }
  | { id: string; type: "notify"; text: string }
  | { id: string; type: "set_stage"; stage: string }
  | { id: string; type: "reminder"; label: string; inDays: number }
  | { id: string; type: "tag"; tag: string }
  | { id: string; type: "branch"; check: BranchCheck; value: string; yes: Step[]; no: Step[] };

type BranchCheck = "stage_is" | "pipeline_is" | "email_opened" | "has_email" | "lead_source" | "answer_contains";

type FilterField = "pipeline" | "source" | "stage" | "has_email" | "confirmation_email";
interface Filter { field: FilterField; value: string }

type ExitKind = "stage_changed" | "booked" | "lead_replied" | "marked_lost";
interface Exit { kind: ExitKind; on: boolean }

interface Settings { quietHours: boolean; reEnter: boolean; senderName: string }


interface Workflow {
  id: string;
  name: string;
  published: boolean;
  trigger: Trigger;
  filters: Filter[];
  steps: Step[];
  exits: Exit[];
  settings: Settings;
  updatedAt: string;
  /** Shown above the canvas: what's true about this workflow today. */
  note?: string;
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
  { type: "notify", label: "Alert the agent", icon: <NotificationsIcon />, help: "WhatsApp nudge to the agent" },
  { type: "set_stage", label: "Move stage", icon: <FlagIcon />, help: "Change the lead's stage" },
  { type: "reminder", label: "Set reminder", icon: <AlarmIcon />, help: "Puts it on the agent's list" },
  { type: "tag", label: "Add tag", icon: <LocalOfferIcon />, help: "Label the lead" },
];

const STEP_COLOR: Record<Step["type"], string> = {
  wait: "#607d8b", whatsapp: "#1da851", email: "#1565c0", notify: "#e65100",
  set_stage: "#6a1b9a", reminder: "#ad1457", tag: "#00838f", branch: "#455a64",
};

const EXIT_LABEL: Record<ExitKind, string> = {
  stage_changed: "The lead's stage changes",
  booked: "An appointment is booked",
  lead_replied: "The lead replies (WhatsApp or email)",
  marked_lost: "The lead is marked Lost or Invalid",
};

const BRANCH_LABEL: Record<BranchCheck, string> = {
  stage_is: "Lead's stage is",
  pipeline_is: "Lead's pipeline is",
  email_opened: "Opened the last email",
  has_email: "Lead has an email address",
  lead_source: "Lead came from",
  answer_contains: "A form answer contains",
};

const FILTER_LABEL: Record<FilterField, string> = {
  pipeline: "Pipeline",
  source: "Source",
  stage: "Stage",
  has_email: "Email",
  confirmation_email: "Page setting",
};

const STAGES = Array.from(new Set([...PIPELINE_STAGES.seller, ...PIPELINE_STAGES.buyer]));

// No {{phone}}: agents tapped the number in the WhatsApp instead of the call
// link, so the call was never logged in EstateKit (Oct 2026).
const MERGE_FIELDS = ["{{first_name}}", "{{name}}", "{{area}}", "{{address}}", "{{stage}}", "{{agent_name}}", "{{agent_phone}}", "{{action_link}}", "{{plan_link}}"];

const SAMPLE_LEAD = { id: "sample", name: "Thandi Mokoena", phone: "082 555 0199", stage: "No Answer", next_label: "Retry today" };

const LINE = "#b6bec7";

let seq = 0;
const nid = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

const NO_EXITS = (): Exit[] => [
  { kind: "stage_changed", on: false },
  { kind: "booked", on: false },
  { kind: "lead_replied", on: false },
  { kind: "marked_lost", on: false },
];
const ALL_EXITS = (): Exit[] => NO_EXITS().map((e) => ({ ...e, on: true }));
const DEFAULT_SETTINGS = (): Settings => ({ quietHours: true, reEnter: false, senderName: "{{agent_name}}" });

function newStep(type: Step["type"]): Step {
  const id = nid();
  switch (type) {
    case "wait": return { id, type, amount: 1, unit: "days" };
    case "whatsapp": return { id, type, to: "agent", text: "" };
    case "email": return { id, type, to: "lead", subject: "", body: "" };
    case "notify": return { id, type, text: "" };
    case "set_stage": return { id, type, stage: "Contacted" };
    case "reminder": return { id, type, label: "Follow up", inDays: 2 };
    case "tag": return { id, type, tag: "" };
    case "branch": return { id, type, check: "email_opened", value: "", yes: [], no: [] };
  }
}

/** Minutes → the friendliest whole unit ("2 days", not "2880 minutes"). */
function waitFrom(minutes: number): Step {
  if (minutes % 1440 === 0) return { id: nid(), type: "wait", amount: minutes / 1440, unit: "days" };
  if (minutes % 60 === 0) return { id: nid(), type: "wait", amount: minutes / 60, unit: "hours" };
  return { id: nid(), type: "wait", amount: minutes, unit: "minutes" };
}

// ── Today's automations, as workflows ────────────────────────────────────

function fromAutomation(a: AutomationRow, steps: AutomationStepRow[]): Workflow {
  const out: Step[] = [];
  for (const s of [...steps].sort((x, y) => x.step_order - y.step_order)) {
    if (s.delay_minutes > 0 && a.trigger_type !== "daily_digest") out.push(waitFrom(s.delay_minutes));
    if (s.action_type === "send_whatsapp") out.push({ id: nid(), type: "whatsapp", to: "agent", text: s.template_text ?? "" });
    else if (s.action_type === "set_stage") out.push({ id: nid(), type: "set_stage", stage: String(s.payload?.stage ?? "") });
    else if (s.action_type === "set_reminder") {
      const p = s.payload as { label?: string; offset_minutes?: number };
      out.push({ id: nid(), type: "reminder", label: p.label ?? "Follow up", inDays: Math.round((p.offset_minutes ?? 0) / 1440) });
    }
  }
  const trigger: Trigger =
    a.trigger_type === "stage_changed" ? { kind: "stage_changed", stage: a.trigger_stage ?? undefined }
      : a.trigger_type === "daily_digest" ? { kind: "daily_at", time: "16:00" }
        : a.trigger_type === "reminder_due" ? { kind: "reminder_due" }
          : { kind: "lead_created" };
  const multiStep = out.filter((s) => s.type !== "wait").length > 1 || out[0]?.type === "wait";
  return {
    id: a.id,
    name: a.name.replace(/â€”/g, "—"),
   
    published: a.enabled,
    trigger,
    filters: [],
    steps: out,
    // The engine today never ends a run early (run-automations has no stage
    // check), so every converted workflow starts with all stop rules off.
    exits: NO_EXITS(),
    settings: { ...DEFAULT_SETTINGS(), quietHours: a.trigger_type !== "lead_created" },
    updatedAt: a.created_at,
    note: multiStep && trigger.kind === "stage_changed"
      ? "Today nothing stops this early: a lead who books after this starts still gets the later nudges. Turn on the stop rules to fix that."
      : undefined,
  };
}

/** send-lead-confirmation, drawn as a workflow: one email per pipeline type. */
function confirmationEmail(): Workflow {
  const sign = "\n\n{{agent_name}}\n{{agent_phone}}";
  return {
    id: "confirmation-email",
    name: "Lead confirmation email",
   
    published: true,
    trigger: { kind: "lead_created" },
    filters: [{ field: "has_email", value: "yes" }, { field: "confirmation_email", value: "on" }],
    exits: NO_EXITS(),
    settings: { ...DEFAULT_SETTINGS(), quietHours: false },
    updatedAt: "2026-09-27T10:00:00Z",
    steps: [
      {
        id: nid(), type: "branch", check: "pipeline_is", value: "Sellers",
        yes: [{ id: nid(), type: "email", to: "lead", subject: "Your {{area}} home evaluation request", body: "Hi {{first_name}},\n\nThanks for requesting a free home evaluation for {{address}}.\n\nI'm having a look at what's sold near you recently. I'll be in touch shortly to go through what your home could be worth, and whether I have buyers looking in the area.\n\nWhile you wait, here's how I'd sell your home: {{plan_link}}" + sign }],
        no: [
          {
            id: nid(), type: "branch", check: "pipeline_is", value: "Buyers",
            yes: [{ id: nid(), type: "email", to: "lead", subject: "Your {{area}} property search", body: "Hi {{first_name}},\n\nThanks for getting in touch about finding your next home.\n\nI've received your details and I'll be in touch shortly." + sign }],
            no: [{ id: nid(), type: "email", to: "lead", subject: "We've received your details", body: "Hi {{first_name}},\n\nThanks for getting in touch.\n\nI've received your details and I'll be in touch shortly." + sign }],
          },
        ],
      },
    ],
  };
}

// ── Templates ────────────────────────────────────────────────────────────

const TEMPLATES: { name: string; blurb: string; make: () => Workflow }[] = [
  {
    name: "No answer → email sequence",
    blurb: "Two missed calls, then 3 emails over a week. Stops when they reply or book.",
    make: () => ({
      id: nid(), name: "No answer → email sequence", published: false, updatedAt: new Date().toISOString(),
      trigger: { kind: "no_answer_times", count: 2 },
      filters: [{ field: "has_email", value: "yes" }],
      exits: ALL_EXITS(), settings: DEFAULT_SETTINGS(),
      steps: [
        { id: nid(), type: "wait", amount: 30, unit: "minutes" },
        { id: nid(), type: "email", to: "lead", subject: "Sorry I missed you, {{first_name}}", body: "Hi {{first_name}},\n\nI tried calling about your home in {{area}}. When's a good time for a quick 5-minute chat?\n\n{{agent_name}}\n{{agent_phone}}" },
        { id: nid(), type: "wait", amount: 2, unit: "days" },
        {
          id: nid(), type: "branch", check: "email_opened", value: "",
          yes: [{ id: nid(), type: "notify", text: "{{first_name}} opened your email. Good moment to call: {{action_link}}" }],
          no: [{ id: nid(), type: "email", to: "lead", subject: "What is your home worth right now?", body: "Hi {{first_name}},\n\nHomes like yours in {{area}} have been selling. I'd be happy to give you a free, no-obligation valuation.\n\n{{agent_name}}" }],
        },
        { id: nid(), type: "wait", amount: 4, unit: "days" },
        { id: nid(), type: "email", to: "lead", subject: "Should I close your file?", body: "Hi {{first_name}},\n\nI haven't been able to reach you, so I'll assume now isn't the right time. If anything changes, just reply to this email.\n\n{{agent_name}}" },
        { id: nid(), type: "reminder", label: "Last try: call", inDays: 1 },
      ],
    }),
  },
  {
    name: "New lead: speed-to-lead",
    blurb: "Alert the agent now, nudge again at 10 and 60 minutes if nobody has called.",
    make: () => ({
      id: nid(), name: "New lead: speed-to-lead", published: false, updatedAt: new Date().toISOString(),
      trigger: { kind: "lead_created" }, filters: [], exits: ALL_EXITS(), settings: { ...DEFAULT_SETTINGS(), quietHours: false },
      steps: [
        { id: nid(), type: "whatsapp", to: "agent", text: "New lead: {{name}}. Tap to contact: {{action_link}}" },
        { id: nid(), type: "wait", amount: 10, unit: "minutes" },
        { id: nid(), type: "branch", check: "stage_is", value: "New Lead", yes: [{ id: nid(), type: "whatsapp", to: "agent", text: "{{first_name}} is still waiting for your call: {{action_link}}" }], no: [] },
        { id: nid(), type: "wait", amount: 1, unit: "hours" },
        { id: nid(), type: "branch", check: "stage_is", value: "New Lead", yes: [{ id: nid(), type: "reminder", label: "Call {{first_name}}", inDays: 0 }], no: [] },
      ],
    }),
  },
  {
    name: "Gone quiet: re-engage",
    blurb: "Contacted but nothing for 14 days: one email, then a reminder for the agent.",
    make: () => ({
      id: nid(), name: "Gone quiet: re-engage", published: false, updatedAt: new Date().toISOString(),
      trigger: { kind: "not_contacted_for", days: 14 }, filters: [{ field: "stage", value: "Contacted" }], exits: ALL_EXITS(), settings: DEFAULT_SETTINGS(),
      steps: [
        { id: nid(), type: "email", to: "lead", subject: "Still thinking about selling, {{first_name}}?", body: "Hi {{first_name}},\n\nJust checking in. Happy to update your valuation whenever suits you.\n\n{{agent_name}}" },
        { id: nid(), type: "wait", amount: 3, unit: "days" },
        { id: nid(), type: "reminder", label: "Call: re-engage", inDays: 0 },
      ],
    }),
  },
  {
    name: "Blank workflow",
    blurb: "Pick your own trigger and steps.",
    make: () => ({ id: nid(), name: "Untitled workflow", published: false, updatedAt: new Date().toISOString(), trigger: { kind: "lead_created" }, filters: [], exits: ALL_EXITS(), settings: DEFAULT_SETTINGS(), steps: [] }),
  },
];

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

/** Insert `step` into the list at `path` ("root" or "<branchId>:yes|no") at `index`. */
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

const unitLabel = (n: number, u: Unit) => `${n} ${n === 1 ? u.replace(/s$/, "") : u}`;

function stepSummary(s: Step): string {
  switch (s.type) {
    case "wait": return `Wait ${unitLabel(s.amount, s.unit)}`;
    case "whatsapp": return s.text.split("\n")[0] || "No message yet";
    case "email": return s.subject || "No subject yet";
    case "notify": return s.text || "No message yet";
    case "set_stage": return `Move to ${s.stage || "…"}`;
    case "reminder": return `${s.label} · ${s.inDays === 0 ? "today" : `in ${s.inDays} day${s.inDays === 1 ? "" : "s"}`}`;
    case "tag": return s.tag ? `Tag "${s.tag}"` : "No tag yet";
    case "branch": return `${BRANCH_LABEL[s.check]}${["stage_is", "pipeline_is", "lead_source", "answer_contains"].includes(s.check) ? ` "${s.value || "…"}"` : ""}?`;
  }
}

function stepTitle(s: Step): string {
  if (s.type === "whatsapp") return `WhatsApp to ${s.to}`;
  if (s.type === "email") return `Email to ${s.to}`;
  return STEP_TYPES.find((x) => x.type === s.type)?.label ?? s.type;
}

function filterSummary(f: Filter): string {
  if (f.field === "has_email") return f.value === "yes" ? "Has an email" : "No email";
  if (f.field === "confirmation_email") return "Confirmation email is on for the page";
  return `${FILTER_LABEL[f.field]}: ${f.value || "…"}`;
}


// ── Root: list ↔ editor ──────────────────────────────────────────────────

export default function WorkflowBuilder() {
  const { data: automations, isLoading: l1 } = useAutomations();
  const { data: steps, isLoading: l2 } = useAutomationSteps();
  if (l1 || l2) return <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}><CircularProgress /></Box>;
  const initial = [
    ...(automations ?? []).map((a) => fromAutomation(a, (steps ?? []).filter((s) => s.automation_id === a.id))),
    confirmationEmail(),
    TEMPLATES[0].make(),
  ];
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

/** Who gets what, in words: "WhatsApp to you", "Email to lead". */
function sendsLabel(steps: Step[]): { icon: React.ReactNode; text: string }[] {
  const seen = new Map<string, { icon: React.ReactNode; text: string }>();
  mapSteps(steps, (s) => {
    if (s.type === "whatsapp") seen.set(`wa-${s.to}`, { icon: <WhatsAppIcon sx={{ fontSize: 16, color: STEP_COLOR.whatsapp }} />, text: s.to === "agent" ? "WhatsApp to agent" : "WhatsApp to lead" });
    if (s.type === "notify") seen.set("wa-agent", { icon: <WhatsAppIcon sx={{ fontSize: 16, color: STEP_COLOR.whatsapp }} />, text: "WhatsApp to agent" });
    if (s.type === "email") seen.set(`em-${s.to}`, { icon: <EmailIcon sx={{ fontSize: 16, color: STEP_COLOR.email }} />, text: s.to === "lead" ? "Email to lead" : "Email to agent" });
    return s;
  });
  return [...seen.values()];
}

function Sends({ steps }: { steps: Step[] }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
      {sendsLabel(steps).map((x) => (
        <Box key={x.text} sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, fontSize: 13, whiteSpace: "nowrap" }}>{x.icon}{x.text}</Box>
      ))}
    </Box>
  );
}

function OnOffChip({ on }: { on: boolean }) {
  return <Chip size="small" label={on ? "On" : "Off"} color={on ? "success" : "default"} variant={on ? "filled" : "outlined"} sx={{ height: 22, fontSize: 12, fontWeight: 600, minWidth: 44 }} />;
}

/** One plain list: on first, then off. No folders. */
function WorkflowList({ workflows, onOpen, onCreate }: { workflows: Workflow[]; onOpen: (id: string) => void; onCreate: () => void }) {
  const isDesktop = useMediaQuery("(min-width:900px)");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "on" | "off">("all");
  const count = (on: boolean) => workflows.filter((w) => w.published === on).length;
  const shown = workflows
    .filter((w) => (filter === "all" || (filter === "on") === w.published) && (!q.trim() || (w.name + " " + triggerSummary(w.trigger)).toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => Number(b.published) - Number(a.published));

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto", p: 2, pb: 6 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 500 }}>Workflows</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Each workflow sends messages for you when something happens to a lead.</Typography>
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
          sx={{ width: 260, maxWidth: "100%", bgcolor: "background.paper" }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
      </Box>

      <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "4px", bgcolor: "background.paper", overflow: "hidden" }}>
        {isDesktop ? (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ "& th": { color: "text.secondary", fontSize: 12.5, bgcolor: tokens.surface2, whiteSpace: "nowrap" } }}>
                <TableCell>Name</TableCell>
                <TableCell>Starts when</TableCell>
                <TableCell>Sends</TableCell>
                <TableCell align="right">Steps</TableCell>
                <TableCell>Status</TableCell>
                <TableCell padding="checkbox" />
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((w) => (
                <TableRow key={w.id} hover onClick={() => onOpen(w.id)} sx={{ cursor: "pointer", "&:last-child td": { borderBottom: 0 }, "& td": { py: 1.25 } }}>
                  <TableCell sx={{ fontWeight: 500, fontSize: 14 }}>
                    {w.name}
                    {w.note && <Tooltip title={w.note}><WarningAmberIcon sx={{ fontSize: 16, color: "#e65100", ml: 0.75, verticalAlign: "-3px" }} /></Tooltip>}
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
                <Typography sx={{ fontWeight: 500, fontSize: 14.5 }}>{w.name}</Typography>
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

// ── Editor ───────────────────────────────────────────────────────────────

type Selection = { kind: "trigger" } | { kind: "filters" } | { kind: "exits" } | { kind: "step"; id: string } | null;
type EditorTab = "builder" | "settings" | "enrollments" | "logs";

/** Undo/redo over whole-workflow snapshots. Typing into one field within a
 *  second is one entry, so Ctrl+Z undoes a word, not a letter. */
function useHistory(initial: Workflow) {
  const [state, setState] = useState({ past: [] as Workflow[], present: initial, future: [] as Workflow[] });
  const last = useRef({ key: "", at: 0 });
  const set = useCallback((fn: (w: Workflow) => Workflow, key = "") => {
    setState((h) => {
      const next = { ...fn(h.present), updatedAt: new Date().toISOString() };
      const now = Date.now();
      const coalesce = key && key === last.current.key && now - last.current.at < 1000;
      last.current = { key, at: now };
      return { past: coalesce ? h.past : [...h.past, h.present].slice(-100), present: next, future: [] };
    });
  }, []);
  const undo = useCallback(() => setState((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h)), []);
  const redo = useCallback(() => setState((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h)), []);
  return { wf: state.present, set, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0, dirty: state.past.length > 0 };
}

function Editor({ initial, onBack }: { initial: Workflow; onBack: (w: Workflow) => void }) {
  const isDesktop = useMediaQuery("(min-width:1000px)");
  const { wf, set, undo, redo, canUndo, canRedo, dirty } = useHistory(initial);
  const [tab, setTab] = useState<EditorTab>("builder");
  const [sel, setSel] = useState<Selection>(null);
  const [editingName, setEditingName] = useState(false);

  const update = (patch: Partial<Workflow>, key?: string) => set((w) => ({ ...w, ...patch }), key);
  const updateStep = (id: string, patch: Partial<Step>, key?: string) =>
    set((w) => ({ ...w, steps: mapSteps(w.steps, (s) => (s.id === id ? ({ ...s, ...patch } as Step) : s)) }), key ? `${id}:${key}` : "");
  const removeStep = (id: string) => {
    set((w) => ({ ...w, steps: mapSteps(w.steps, (s) => (s.id === id ? null : s)) }));
    setSel(null);
  };
  const addStep = (path: string, index: number, type: Step["type"]) => {
    const s = newStep(type);
    set((w) => ({ ...w, steps: insertAt(w.steps, path, index, s) }));
    setSel({ kind: "step", id: s.id });
  };

  // Keyboard: Esc closes the panel, Ctrl/Cmd+Z undoes, Shift (or Y) redoes.
  // Skipped while typing so the field's own undo still works.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if (e.key === "Escape") setSel(null);
      if (typing || !(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "z") { e.preventDefault(); (e.shiftKey ? redo : undo)(); }
      if (e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const selectedStep = sel?.kind === "step" ? findStep(wf.steps, sel.id) : undefined;
  const panelOpen = tab === "builder" && !!sel && (sel.kind !== "step" || !!selectedStep);
  const panelTitle = sel?.kind === "trigger" ? "Trigger" : sel?.kind === "filters" ? "Only run if" : sel?.kind === "exits" ? "Stop early when" : selectedStep ? stepTitle(selectedStep) : "";

  const panel = panelOpen && (
    <DetailsPanel
      title={panelTitle}
      onClose={() => setSel(null)}
      onDelete={selectedStep ? () => removeStep(selectedStep.id) : undefined}
      deleteLabel={selectedStep?.type === "branch" ? "Delete step and its paths" : "Delete step"}
    >
      <NodePreview sel={sel} wf={wf} step={selectedStep} />
      {sel?.kind === "trigger" && <TriggerEditor t={wf.trigger} onChange={(trigger) => update({ trigger }, "trigger")} />}
      {sel?.kind === "filters" && <FiltersEditor filters={wf.filters} onChange={(filters) => update({ filters }, "filters")} />}
      {sel?.kind === "exits" && <ExitsEditor exits={wf.exits} onChange={(exits) => update({ exits })} />}
      {selectedStep && <StepEditor step={selectedStep} onChange={(p, key) => updateStep(selectedStep.id, p, key)} />}
    </DetailsPanel>
  );

  return (
    // A fixed-height frame: the header and tabs never scroll away, and the
    // canvas and the details panel each scroll on their own.
    <Box sx={{ height: { xs: "calc(100dvh - 100px)", md: "calc(100dvh - 100px)" }, display: "flex", flexDirection: "column", minHeight: 420 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, height: 56, flex: "none", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => onBack(wf)} sx={{ textTransform: "none", color: "text.primary", flex: "none" }}>
          {isDesktop ? "Workflows" : ""}
        </Button>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 0.5 }}>
          {editingName ? (
            <InputBase
              autoFocus
              value={wf.name}
              onChange={(e) => update({ name: e.target.value }, "name")}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingName(false); }}
              inputProps={{ "aria-label": "Workflow name" }}
              sx={{ fontWeight: 600, fontSize: 15, borderBottom: "2px solid", borderColor: "primary.main", maxWidth: 420, width: "100%", "& input": { textAlign: "center" } }}
            />
          ) : (
            <Box component="button" type="button" onClick={() => setEditingName(true)} sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, minWidth: 0, font: "inherit", color: "inherit", bgcolor: "transparent", border: 0, cursor: "text", p: "6px 8px", borderRadius: "4px", "&:hover": { bgcolor: tokens.hover } }}>
              <Typography noWrap sx={{ fontWeight: 600, fontSize: 15 }}>{wf.name}</Typography>
              <EditIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            </Box>
          )}
        </Box>
        <Tooltip title="Undo (Ctrl+Z)"><span><IconButton onClick={undo} disabled={!canUndo} aria-label="Undo"><UndoIcon fontSize="small" /></IconButton></span></Tooltip>
        {isDesktop && <Tooltip title="Redo (Ctrl+Shift+Z)"><span><IconButton onClick={redo} disabled={!canRedo} aria-label="Redo"><RedoIcon fontSize="small" /></IconButton></span></Tooltip>}
        <Tooltip title={wf.published ? "On: running for leads" : "Off: not running"}>
          <Box sx={{ display: "flex", alignItems: "center", flex: "none" }}>
            {isDesktop && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{wf.published ? "On" : "Off"}</Typography>}
            <Switch checked={wf.published} onChange={(e) => update({ published: e.target.checked })} slotProps={{ input: { "aria-label": "Workflow on" } }} />
          </Box>
        </Tooltip>
        <Tooltip title="Preview only: saving comes with the backend">
          <span>
            <Button variant="contained" size="small" disabled sx={{ position: "relative", overflow: "visible" }}>
              Save
              {dirty && <Box component="span" sx={{ position: "absolute", top: -4, right: -4, width: 10, height: 10, borderRadius: "50%", bgcolor: "#e53935", border: "2px solid #fff" }} aria-label="Unsaved changes" />}
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
        {([["builder", "Builder"], ["settings", "Settings"], ["enrollments", "Enrollment history"], ["logs", "Execution logs"]] as const).map(([v, l]) => (
          <Tab key={v} value={v} label={l} sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }} />
        ))}
      </Tabs>

      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
        {tab === "builder" && (
          <>
            <Canvas wf={wf} sel={sel} setSel={setSel} onAdd={addStep} />
            {isDesktop ? (
              panelOpen && <Box sx={{ width: 380, flex: "none", borderLeft: `1px solid ${tokens.divider}`, bgcolor: "background.paper", minHeight: 0 }}>{panel}</Box>
            ) : (
              <Drawer anchor="bottom" open={panelOpen} onClose={() => setSel(null)} slotProps={{ paper: { sx: { height: "85dvh", borderRadius: "12px 12px 0 0" } } }}>
                {panel}
              </Drawer>
            )}
          </>
        )}
        {tab === "settings" && <SettingsTab wf={wf} onChange={update} />}
        {tab === "enrollments" && <HistoryTab kind="enrollments" wf={wf} />}
        {tab === "logs" && <HistoryTab kind="logs" wf={wf} />}
      </Box>
    </Box>
  );
}

/** The side/bottom sheet: title and close stay pinned at the top, Done and
 *  Delete at the bottom, and only the fields in between scroll. */
function DetailsPanel({ title, onClose, onDelete, deleteLabel, children }: { title: string; onClose: () => void; onDelete?: () => void; deleteLabel: string; children: React.ReactNode }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ position: "sticky", top: 0, zIndex: 1, display: "flex", alignItems: "center", gap: 1, px: 2, height: 52, flex: "none", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Typography sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>{title}</Typography>
        <IconButton onClick={onClose} aria-label="Close" size="small"><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", p: 2, display: "flex", flexDirection: "column", gap: 2, "& > *": { flexShrink: 0 } }}>
        {children}
      </Box>
      <Box sx={{ position: "sticky", bottom: 0, display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.25, pb: "calc(10px + env(safe-area-inset-bottom, 0px))", flex: "none", bgcolor: "background.paper", borderTop: `1px solid ${tokens.divider}` }}>
        {onDelete && (confirming ? (
          <>
            <Typography sx={{ fontSize: 13, flex: 1 }}>Delete this step?</Typography>
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

function Canvas({ wf, sel, setSel, onAdd }: { wf: Workflow; sel: Selection; setSel: (s: Selection) => void; onAdd: (path: string, index: number, t: Step["type"]) => void }) {
  const narrow = useMediaQuery("(max-width:700px)");
  const [zoom, setZoom] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const exitsOn = wf.exits.filter((x) => x.on);

  return (
    <Box sx={{ flex: 1, minWidth: 0, position: "relative", bgcolor: tokens.bg }}>
      <Box
        ref={scroller}
        sx={{
          position: "absolute", inset: 0, overflow: "auto",
          // Dot grid, the usual "this is a canvas" cue.
          backgroundImage: "radial-gradient(circle, #d3d8de 1px, transparent 1px)",
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        }}
      >
        {wf.note && (
          <Box sx={{ position: "sticky", top: 0, left: 0, zIndex: 2, display: "flex", gap: 1, alignItems: "flex-start", bgcolor: tokens.amberTint, borderBottom: `1px solid #f0d58a`, px: 2, py: 1 }}>
            <WarningAmberIcon sx={{ fontSize: 18, color: "#b26a00", mt: "2px" }} />
            <Typography sx={{ fontSize: 13 }}>{wf.note}</Typography>
          </Box>
        )}
        <Box sx={{ zoom, display: "flex", flexDirection: "column", alignItems: "center", py: 4, px: 3, minWidth: "fit-content" }}>
          <Node color="#1976d2" icon={<BoltIcon />} title="Trigger" text={triggerSummary(wf.trigger)} selected={sel?.kind === "trigger"} onClick={() => setSel({ kind: "trigger" })} />
          <Line />
          <Node
            color="#546e7a"
            icon={<FilterAltIcon />}
            title="Only if"
            text={wf.filters.length ? wf.filters.map(filterSummary).join(" · ") : "Every lead (no filters)"}
            selected={sel?.kind === "filters"}
            onClick={() => setSel({ kind: "filters" })}
            dashed={!wf.filters.length}
          />
          <StepList steps={wf.steps} path="root" sel={sel} setSel={setSel} onAdd={onAdd} narrow={narrow} />
          <Line />
          <Node
            color="#b71c1c"
            icon={<BlockIcon />}
            title="Stop early when"
            text={exitsOn.length ? exitsOn.map((x) => EXIT_LABEL[x.kind]).join(" · ") : "Nothing: every step always runs"}
            selected={sel?.kind === "exits"}
            onClick={() => setSel({ kind: "exits" })}
            dashed={!exitsOn.length}
          />
          <Line />
          <Box sx={{ px: 1.5, py: 0.5, borderRadius: "999px", bgcolor: "#37474f", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: ".08em" }}>END</Box>
          <Timeline wf={wf} />
        </Box>
      </Box>

      <Box sx={{ position: "absolute", left: 12, bottom: 12, display: "flex", alignItems: "center", bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "6px", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
        <IconButton size="small" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))} aria-label="Zoom out"><ZoomOutIcon fontSize="small" /></IconButton>
        <Typography sx={{ fontSize: 12, width: 40, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{Math.round(zoom * 100)}%</Typography>
        <IconButton size="small" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1)))} aria-label="Zoom in"><ZoomInIcon fontSize="small" /></IconButton>
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

function Line({ h = 24 }: { h?: number }) {
  return <Box sx={{ width: 2, height: h, bgcolor: LINE, flex: "none" }} />;
}

function Node({ color, icon, title, text, selected, onClick, dashed }: { color: string; icon: React.ReactNode; title: string; text: string; selected: boolean; onClick: () => void; dashed?: boolean }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        width: 300, maxWidth: "calc(100vw - 48px)", display: "flex", gap: 1.25, alignItems: "center", textAlign: "left", font: "inherit", color: "inherit",
        bgcolor: "background.paper", borderRadius: "8px", p: 1.25, cursor: "pointer", flex: "none",
        border: `1px ${dashed ? "dashed" : "solid"} ${selected ? "#1976d2" : tokens.divider}`,
        boxShadow: selected ? "0 0 0 3px rgba(25,118,210,.25)" : "0 1px 2px rgba(0,0,0,.06)",
        transition: "box-shadow .12s, border-color .12s",
        "&:hover": { borderColor: selected ? "#1976d2" : "#9aa5b1" },
        "&:focus-visible": { outline: "none", boxShadow: "0 0 0 3px rgba(25,118,210,.4)" },
      }}
    >
      <Box sx={{ width: 32, height: 32, flex: "none", borderRadius: "6px", bgcolor: color, color: "#fff", display: "grid", placeItems: "center", "& svg": { fontSize: 18 } }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "text.secondary" }}>{title}</Typography>
        <Typography sx={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</Typography>
      </Box>
    </Box>
  );
}

function AddButton({ onPick }: { onPick: (t: Step["type"]) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Line h={14} />
      <Tooltip title="Add a step">
        <IconButton
          size="small"
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label="Add a step"
          sx={{ width: 26, height: 26, flex: "none", border: `1px solid ${LINE}`, bgcolor: "background.paper", "&:hover": { bgcolor: "primary.main", color: "#fff", borderColor: "primary.main" } }}
        >
          <AddIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Line h={14} />
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {STEP_TYPES.map((t) => (
          <MenuItem key={t.type} onClick={() => { onPick(t.type); setAnchor(null); }} sx={{ gap: 1.5, minWidth: 250, py: 1 }}>
            <Box sx={{ width: 28, height: 28, borderRadius: "6px", bgcolor: STEP_COLOR[t.type], color: "#fff", display: "grid", placeItems: "center", "& svg": { fontSize: 16 } }}>{t.icon}</Box>
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
function StepList({ steps, path, sel, setSel, onAdd, narrow }: { steps: Step[]; path: string; sel: Selection; setSel: (s: Selection) => void; onAdd: (path: string, index: number, t: Step["type"]) => void; narrow: boolean }) {
  return (
    <>
      <AddButton onPick={(t) => onAdd(path, 0, t)} />
      {steps.map((s, i) => (
        <Box key={s.id} sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Node
            color={STEP_COLOR[s.type]}
            icon={STEP_TYPES.find((x) => x.type === s.type)?.icon}
            title={stepTitle(s)}
            text={stepSummary(s)}
            selected={sel?.kind === "step" && sel.id === s.id}
            onClick={() => setSel({ kind: "step", id: s.id })}
          />
          {s.type === "branch" && <Branch step={s} sel={sel} setSel={setSel} onAdd={onAdd} narrow={narrow} />}
          <AddButton onPick={(t) => onAdd(path, i + 1, t)} />
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
function Branch({ step, sel, setSel, onAdd, narrow }: { step: Extract<Step, { type: "branch" }>; sel: Selection; setSel: (s: Selection) => void; onAdd: (path: string, index: number, t: Step["type"]) => void; narrow: boolean }) {
  const lanes = (["yes", "no"] as const);
  if (narrow) {
    // Side by side doesn't fit a phone: stack Yes above No, each marked by a rail.
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {lanes.map((side) => (
          <Box key={side} sx={{ display: "flex", flexDirection: "column", alignItems: "center", borderLeft: `3px solid ${side === "yes" ? "#2e7d32" : "#9e9e9e"}`, pl: 1.5, ml: 1.5, mt: 1 }}>
            <LaneLabel side={side} />
            <StepList steps={step[side]} path={`${step.id}:${side}`} sel={sel} setSel={setSel} onAdd={onAdd} narrow />
          </Box>
        ))}
      </Box>
    );
  }
  const rule = (i: number) => ({
    content: '""', position: "absolute", height: 2, bgcolor: LINE,
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
            <StepList steps={step[side]} path={`${step.id}:${side}`} sel={sel} setSel={setSel} onAdd={onAdd} narrow={false} />
            <Box sx={{ flex: 1, width: 2, minHeight: 12, bgcolor: LINE }} />
          </Box>
        ))}
      </Box>
    </>
  );
}

function LaneLabel({ side }: { side: "yes" | "no" }) {
  return (
    <Box sx={{ px: 1.25, py: 0.25, borderRadius: "999px", fontSize: 12, fontWeight: 600, flex: "none", bgcolor: side === "yes" ? "#e8f5e9" : "#eceff1", color: side === "yes" ? "#1b5e20" : "#455a64", border: `1px solid ${side === "yes" ? "#a5d6a7" : "#cfd8dc"}` }}>
      {side === "yes" ? "Yes" : "No"}
    </Box>
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
    <Box sx={{ width: 420, maxWidth: "calc(100vw - 48px)", mt: 4, bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", p: 1.5 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "text.secondary", mb: 1 }}>How this plays out for one lead</Typography>
      {rows.map((r, i) => (
        <Box key={i} sx={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 1, fontSize: 13, py: 0.5, borderTop: i ? `1px solid ${tokens.divider2}` : 0 }}>
          <Box sx={{ color: "text.secondary", fontWeight: 500 }}>{r.at}</Box>
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

function SettingsTab({ wf, onChange }: { wf: Workflow; onChange: (p: Partial<Workflow>, key?: string) => void }) {
  const s = wf.settings;
  const setS = (p: Partial<Settings>, key?: string) => onChange({ settings: { ...s, ...p } }, key);
  return (
    <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
      <Box sx={{ maxWidth: 720, mx: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", p: 2 }}>
          <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Sending</Typography>
          <SettingRow title="Quiet hours" help="Follow-ups due between 20:00 and 08:00 (SAST) wait until 08:00. New-lead alerts always go straight away.">
            <Switch checked={s.quietHours} onChange={(e) => setS({ quietHours: e.target.checked })} />
          </SettingRow>
          <SettingRow title="Emails come from" help="The name leads see. Replies go to the agent's own email.">
            <TextField size="small" value={s.senderName} onChange={(e) => setS({ senderName: e.target.value }, "sender")} sx={{ width: 200 }} />
          </SettingRow>
        </Box>
        <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", p: 2 }}>
          <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Who goes through it</Typography>
          <SettingRow title="Allow the same lead in again" help="Off: a lead goes through this workflow once. On: every time the trigger happens.">
            <Switch checked={s.reEnter} onChange={(e) => setS({ reEnter: e.target.checked })} />
          </SettingRow>
        </Box>
        <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography sx={{ fontWeight: 600 }}>Stop early when</Typography>
          <ExitsEditor exits={wf.exits} onChange={(exits) => onChange({ exits })} />
        </Box>
      </Box>
    </Box>
  );
}

const SAMPLE_PEOPLE = ["Thandi Mokoena", "Pieter van der Merwe", "Lerato Khumalo", "Ahmed Suleman", "Jessica Botha"];

function HistoryTab({ kind, wf }: { kind: "enrollments" | "logs"; wf: Workflow }) {
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState("all");
  const [action, setAction] = useState("all");
  const isDesktop = useMediaQuery("(min-width:900px)");
  const actions = useMemo(() => wf.steps.filter((s) => s.type !== "wait" && s.type !== "branch"), [wf.steps]);
  const statuses = useMemo(() => (kind === "logs" ? ["Delivered", "Opened", "Skipped: quiet hours", "Failed"] : ["Active", "Finished", "Stopped early"]), [kind]);

  // SAMPLE rows so the layout can be judged. The backend reads these from
  // workflow runs (enrolments) and the per-step results (logs).
  const rows = useMemo(() => {
    const now = Date.now();
    return SAMPLE_PEOPLE.flatMap((name, i) => {
      const step = actions[i % Math.max(1, actions.length)];
      return [{
        name,
        when: new Date(now - (i * 7 + 2) * 3600_000).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
        action: step ? stepTitle(step) : "—",
        status: statuses[i % statuses.length],
        next: kind === "enrollments" && i % 3 === 0 ? new Date(now + (i + 1) * 5 * 3600_000).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—",
        reason: triggerSummary(wf.trigger),
      }];
    });
  }, [kind, wf.trigger, actions, statuses]);

  const shown = rows.filter((r) =>
    (!contact || r.name.toLowerCase().includes(contact.toLowerCase())) &&
    (status === "all" || r.status === status) &&
    (action === "all" || r.action === action));

  return (
    <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
      <Box sx={{ maxWidth: 1100, mx: "auto" }}>
        <Typography sx={{ fontSize: 22, fontWeight: 500 }}>{kind === "logs" ? "Execution logs" : "Enrollment history"}</Typography>
        <Typography component="div" sx={{ fontSize: 13.5, color: "text.secondary", mb: 2 }}>
          {kind === "logs" ? "Every message and action this workflow performed, and how it went." : "Every lead that entered this workflow, and where they are now."}
          <Chip size="small" label="Sample rows" color="warning" variant="outlined" sx={{ ml: 1, height: 20, fontSize: 11 }} />
        </Typography>
        <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap", alignItems: "center", position: "sticky", top: -16, zIndex: 1, bgcolor: tokens.bg, py: 1 }}>
          <TextField size="small" type="date" label="From" slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 160, bgcolor: "background.paper" }} />
          <TextField size="small" type="date" label="To" slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 160, bgcolor: "background.paper" }} />
          {kind === "logs" && (
            <TextField select size="small" value={action} onChange={(e) => setAction(e.target.value)} sx={{ width: 190, bgcolor: "background.paper" }}>
              <MenuItem value="all">All actions</MenuItem>
              {Array.from(new Set(actions.map(stepTitle))).map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
            </TextField>
          )}
          <TextField select size="small" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ width: 190, bgcolor: "background.paper" }}>
            <MenuItem value="all">All statuses</MenuItem>
            {statuses.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField size="small" placeholder="Search lead" value={contact} onChange={(e) => setContact(e.target.value)} sx={{ flex: 1, minWidth: 160, bgcolor: "background.paper" }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          <Tooltip title="Refresh"><IconButton sx={{ border: `1px solid ${tokens.divider}`, bgcolor: "background.paper" }} aria-label="Refresh"><RefreshIcon fontSize="small" /></IconButton></Tooltip>
        </Box>
        <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", overflowX: "auto" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ "& th": { color: "text.secondary", fontSize: 12.5, bgcolor: tokens.surface2, whiteSpace: "nowrap" } }}>
                <TableCell>Lead</TableCell>
                {kind === "enrollments" && isDesktop && <TableCell>Why they entered</TableCell>}
                <TableCell>{kind === "logs" ? "Action" : "Current step"}</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>{kind === "logs" ? "Ran at (SAST)" : "Entered (SAST)"}</TableCell>
                {kind === "enrollments" && <TableCell>Next step at</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.name} hover>
                  <TableCell sx={{ fontWeight: 500, fontSize: 13.5, whiteSpace: "nowrap" }}>{r.name}</TableCell>
                  {kind === "enrollments" && isDesktop && <TableCell sx={{ fontSize: 13, color: "text.secondary" }}>{r.reason}</TableCell>}
                  <TableCell sx={{ fontSize: 13 }}>{r.action}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={r.status}
                      variant="outlined"
                      color={/Delivered|Opened|Finished/.test(r.status) ? "success" : /Failed|Stopped/.test(r.status) ? "error" : r.status === "Active" ? "primary" : "default"}
                      sx={{ height: 22, fontSize: 12 }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: 13, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{r.when}</TableCell>
                  {kind === "enrollments" && <TableCell sx={{ fontSize: 13, whiteSpace: "nowrap", color: "text.secondary" }}>{r.next}</TableCell>}
                </TableRow>
              ))}
              {!shown.length && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: "center", py: 6 }}>
                    <SearchIcon sx={{ color: "primary.main", bgcolor: tokens.primaryBg, borderRadius: "50%", p: 1, fontSize: 40 }} />
                    <Typography sx={{ fontWeight: 500, mt: 1 }}>{kind === "logs" ? "No logs found" : "No enrollments found"}</Typography>
                    <Typography sx={{ fontSize: 13, color: "text.secondary" }}>History is kept for the last 60 days.</Typography>
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

const FILTER_OPTIONS: Record<FilterField, { v: string; l: string }[]> = {
  has_email: [{ v: "yes", l: "Has an email" }, { v: "no", l: "No email" }],
  stage: STAGES.map((s) => ({ v: s, l: s })),
  pipeline: [{ v: "Sellers", l: "Sellers" }, { v: "Buyers", l: "Buyers" }],
  source: [{ v: "Facebook form", l: "Facebook form" }, { v: "EstateKit page", l: "EstateKit page" }, { v: "Added by hand", l: "Added by hand" }],
  confirmation_email: [{ v: "on", l: "Confirmation email is on" }],
};

function FiltersEditor({ filters, onChange }: { filters: Filter[]; onChange: (f: Filter[]) => void }) {
  return (
    <>
      <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Leads must match all of these. Leave it empty to run for every lead.</Typography>
      {filters.map((f, i) => (
        <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <TextField select size="small" value={f.field} onChange={(e) => { const field = e.target.value as FilterField; onChange(filters.map((x, j) => (j === i ? { field, value: FILTER_OPTIONS[field][0].v } : x))); }} sx={{ width: 130, flex: "none" }}>
            {(Object.keys(FILTER_LABEL) as FilterField[]).map((k) => <MenuItem key={k} value={k}>{FILTER_LABEL[k]}</MenuItem>)}
          </TextField>
          <TextField select size="small" value={f.value} onChange={(e) => onChange(filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} sx={{ flex: 1, minWidth: 0 }}>
            {FILTER_OPTIONS[f.field].map((o) => <MenuItem key={o.v} value={o.v}>{o.l}</MenuItem>)}
          </TextField>
          <IconButton size="small" onClick={() => onChange(filters.filter((_, j) => j !== i))} aria-label="Remove filter"><DeleteOutlinedIcon fontSize="small" /></IconButton>
        </Box>
      ))}
      <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...filters, { field: "stage", value: "New Lead" }])} sx={{ alignSelf: "flex-start" }}>Add filter</Button>
    </>
  );
}

function ExitsEditor({ exits, onChange }: { exits: Exit[]; onChange: (e: Exit[]) => void }) {
  return (
    <>
      <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
        The lead leaves the workflow as soon as one of these happens, so nobody gets a "still interested?" message after they've booked.
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
    <Box>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>Insert a field</Typography>
      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
        {MERGE_FIELDS.map((f) => <Chip key={f} size="small" variant="outlined" label={f} onClick={() => onInsert(f)} sx={{ fontSize: 11, height: 24 }} />)}
      </Box>
    </Box>
  );
}

const SAMPLE_FIELDS: Record<string, string> = {
  first_name: "Thandi", name: "Thandi Mokoena", area: "Bryanston", address: "14 Oak Avenue, Bryanston", agent_name: "Megan Demo",
  agent_phone: "083 555 0103", plan_link: "leads.estatekit.co/plan/…", count: "7", leads_word: "leads", stage: "No Answer",
};
const fill = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (m, k: string) => SAMPLE_FIELDS[k] ?? (k === "action_link" ? "leads.estatekit.co/l/…" : m));

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


function StepEditor({ step, onChange }: { step: Step; onChange: (p: Partial<Step>, key?: string) => void }) {
  switch (step.type) {
    case "wait":
      return (
        <>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField size="small" type="number" label="Wait" value={step.amount} onChange={(e) => onChange({ amount: Math.max(0, Number(e.target.value)) }, "amount")} sx={{ width: 110 }} />
            <TextField select size="small" value={step.unit} onChange={(e) => onChange({ unit: e.target.value as Unit })} sx={{ flex: 1 }}>
              <MenuItem value="minutes">minutes</MenuItem>
              <MenuItem value="hours">hours</MenuItem>
              <MenuItem value="days">days</MenuItem>
            </TextField>
          </Box>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Counted from the step before. Quiet hours (Settings) can push a message to 08:00.</Typography>
        </>
      );
    case "whatsapp":
      return (
        <>
          <TextField select size="small" label="Send to" value={step.to} onChange={(e) => onChange({ to: e.target.value as "agent" | "lead" })}>
            <MenuItem value="agent">The agent (nudge about this lead)</MenuItem>
            <MenuItem value="lead">The lead</MenuItem>
          </TextField>
          <TextField size="small" multiline minRows={4} label="Message" value={step.text} onChange={(e) => onChange({ text: e.target.value }, "text")} />
          <MergeFields onInsert={(f) => onChange({ text: step.text + f })} />
        </>
      );
    case "email":
      return (
        <>
          <TextField select size="small" label="Send to" value={step.to} onChange={(e) => onChange({ to: e.target.value as "agent" | "lead" })}>
            <MenuItem value="lead">The lead (from the agent's name)</MenuItem>
            <MenuItem value="agent">The agent</MenuItem>
          </TextField>
          <TextField size="small" label="Subject" value={step.subject} onChange={(e) => onChange({ subject: e.target.value }, "subject")} />
          <TextField size="small" multiline minRows={7} label="Email" value={step.body} onChange={(e) => onChange({ body: e.target.value }, "body")} />
          <MergeFields onInsert={(f) => onChange({ body: step.body + f })} />
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Skipped for leads without an email address. Opens and clicks are tracked.</Typography>
        </>
      );
    case "notify":
      return (
        <>
          <TextField size="small" multiline minRows={3} label="Alert text" value={step.text} onChange={(e) => onChange({ text: e.target.value }, "text")} />
          <MergeFields onInsert={(f) => onChange({ text: step.text + f })} />
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
          <TextField size="small" type="number" label="Due in (days, 0 = today)" value={step.inDays} onChange={(e) => onChange({ inDays: Math.max(0, Number(e.target.value)) }, "days")} />
        </>
      );
    case "tag":
      return <TextField size="small" label="Tag" value={step.tag} onChange={(e) => onChange({ tag: e.target.value }, "tag")} placeholder="e.g. cold, nurture, investor" />;
    case "branch":
      return (
        <>
          <TextField select size="small" label="Check" value={step.check} onChange={(e) => onChange({ check: e.target.value as BranchCheck, value: "" })}>
            {(Object.keys(BRANCH_LABEL) as BranchCheck[]).map((k) => <MenuItem key={k} value={k}>{BRANCH_LABEL[k]}</MenuItem>)}
          </TextField>
          {step.check === "stage_is" && (
            <TextField select size="small" label="Stage" value={step.value} onChange={(e) => onChange({ value: e.target.value })}>
              {STAGES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
          )}
          {step.check === "pipeline_is" && (
            <TextField select size="small" label="Pipeline" value={step.value} onChange={(e) => onChange({ value: e.target.value })}>
              <MenuItem value="Sellers">Sellers</MenuItem>
              <MenuItem value="Buyers">Buyers</MenuItem>
            </TextField>
          )}
          {step.check === "lead_source" && (
            <TextField select size="small" label="Source" value={step.value} onChange={(e) => onChange({ value: e.target.value })}>
              <MenuItem value="Facebook form">Facebook form</MenuItem>
              <MenuItem value="EstateKit page">EstateKit page</MenuItem>
            </TextField>
          )}
          {step.check === "answer_contains" && <TextField size="small" label="Text" value={step.value} onChange={(e) => onChange({ value: e.target.value }, "value")} placeholder="e.g. As soon as possible" />}
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Add steps under Yes and No on the canvas. Both paths join again and carry on to the steps below.</Typography>
        </>
      );
  }
}

// ── Previews: what each node actually does, on a sample lead ─────────────

const STAGE_COLOR: Record<string, string> = {
  "New Lead": "#1976d2", "No Answer": "#e65100", Contacted: "#6a1b9a", Booked: "#2e7d32", "Viewing Booked": "#2e7d32",
  "Offer Made": "#00838f", "Mandate Signed": "#1b5e20", Bought: "#1b5e20", Lost: "#757575", "Invalid Number": "#757575",
};

function StageChip({ stage, glow }: { stage: string; glow?: boolean }) {
  const c = STAGE_COLOR[stage] ?? "#546e7a";
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: 12.5, fontWeight: 500, px: 1, py: 0.25, borderRadius: "999px", color: c, bgcolor: `${c}14`, border: `1px solid ${c}55`, boxShadow: glow ? `0 0 0 3px ${c}33` : "none", whiteSpace: "nowrap" }}>
      <Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: c }} />{stage || "…"}
    </Box>
  );
}

/** A lead as it appears in the agent's leads list, so the change is obvious. */
function LeadRowMock({ stage, next, nextDue, tags = [], newTag, highlight }: { stage: string; next?: string; nextDue?: string; tags?: string[]; newTag?: string; highlight?: "stage" | "next" | "tag" }) {
  const hl = (on: boolean) => (on ? { bgcolor: "#fff8e1", outline: "2px solid #ffb300", outlineOffset: 2, borderRadius: "4px" } : {});
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: 13, color: nextDue ? "#e65100" : "text.secondary", ...hl(highlight === "next"), px: highlight === "next" ? 0.5 : 0 }}>
          {nextDue && <AlarmIcon sx={{ fontSize: 15 }} />}
          <span>Next: {next}</span>
          {nextDue && <Box component="span" sx={{ color: "text.secondary" }}>· {nextDue}</Box>}
        </Box>
      )}
      {(tags.length > 0 || newTag !== undefined) && (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {tags.map((t) => <Chip key={t} size="small" icon={<LocalOfferIcon />} label={t} sx={{ height: 22, fontSize: 12 }} />)}
          {newTag !== undefined && (
            <Chip size="small" icon={<LocalOfferIcon />} label={newTag || "your tag"} color="info" sx={{ height: 22, fontSize: 12, ...(highlight === "tag" ? { outline: "2px solid #ffb300", outlineOffset: 2 } : {}) }} />
          )}
        </Box>
      )}
    </Box>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary", fontSize: 12.5, pl: 2 }}>
      <Box sx={{ width: 2, height: 18, bgcolor: LINE }} />{label}
    </Box>
  );
}

const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
const when = (d: Date) => d.toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function NodePreview({ sel, wf, step }: { sel: Selection; wf: Workflow; step: Step | undefined }) {
  let body: React.ReactNode = null;
  if (sel?.kind === "trigger") {
    const t = wf.trigger;
    const event =
      t.kind === "stage_changed" ? <>Agent moves {SAMPLE_LEAD.name.split(" ")[0]} to <StageChip stage={t.stage ?? ""} /></>
        : t.kind === "lead_created" ? <>{SAMPLE_LEAD.name} fills in the form on your ad</>
          : t.kind === "no_answer_times" ? <>Agent logs "No answer" for the {t.count ?? 1}{(t.count ?? 1) === 1 ? "st" : (t.count ?? 1) === 2 ? "nd" : (t.count ?? 1) === 3 ? "rd" : "th"} time</>
            : t.kind === "daily_at" ? <>It's a weekday and the clock hits {t.time ?? "16:00"}</>
              : <>{triggerSummary(t)}</>;
    body = (
      <>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", fontSize: 13.5 }}><BoltIcon sx={{ fontSize: 18, color: "#1976d2" }} />{event}</Box>
        <Arrow label="This workflow starts for that lead" />
        {t.kind !== "daily_at" && <LeadRowMock stage={t.kind === "stage_changed" ? t.stage ?? "New Lead" : t.kind === "no_answer_times" ? "No Answer" : "New Lead"} highlight={t.kind === "stage_changed" ? "stage" : undefined} />}
      </>
    );
  } else if (sel?.kind === "filters") {
    body = wf.filters.length ? (
      <Box sx={{ display: "grid", gap: 0.75 }}>
        {wf.filters.map((f, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1, fontSize: 13.5 }}>
            <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: "#e8f5e9", color: "#2e7d32", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>✓</Box>
            {filterSummary(f)}
          </Box>
        ))}
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{SAMPLE_LEAD.name} matches all of these, so she goes through. A lead that misses one is skipped.</Typography>
      </Box>
    ) : <Typography sx={{ fontSize: 13.5 }}>No filters: every lead goes through.</Typography>;
  } else if (sel?.kind === "exits") {
    const on = wf.exits.filter((x) => x.on);
    body = on.length ? (
      <>
        <LeadRowMock stage="Booked" highlight="stage" />
        <Arrow label="She booked, so she leaves the workflow" />
        <Typography sx={{ fontSize: 13.5 }}>No more messages go to her or about her.</Typography>
      </>
    ) : <Typography sx={{ fontSize: 13.5, color: "#b26a00" }}>Nothing stops it: every step runs, even after she books.</Typography>;
  } else if (step) {
    const start = new Date();
    start.setHours(10, 0, 0, 0);
    switch (step.type) {
      case "whatsapp":
      case "notify": {
        const text = step.text;
        const toAgent = step.type === "notify" || step.to === "agent";
        body = (
          <>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{toAgent ? "Arrives on the agent's WhatsApp:" : `Arrives on ${SAMPLE_LEAD.name.split(" ")[0]}'s WhatsApp:`}</Typography>
            <WhatsAppPreview lead={SAMPLE_LEAD} text={text} sampleFields={SAMPLE_FIELDS} />
          </>
        );
        break;
      }
      case "email":
        body = (
          <>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Lands in {step.to === "lead" ? `${SAMPLE_LEAD.name.split(" ")[0]}'s` : "the agent's"} inbox:</Typography>
            <EmailPreview subject={step.subject} body={step.body} />
          </>
        );
        break;
      case "wait": {
        const mins = step.amount * (step.unit === "minutes" ? 1 : step.unit === "hours" ? 60 : 1440);
        let next = addMinutes(start, mins);
        const h = next.getHours();
        const deferred = wf.settings.quietHours && (h >= 20 || h < 8);
        if (deferred) { next = new Date(next); if (h >= 20) next.setDate(next.getDate() + 1); next.setHours(8, 0, 0, 0); }
        body = (
          <Box sx={{ display: "grid", gap: 0.5, fontSize: 13.5 }}>
            <Box sx={{ display: "flex", gap: 1 }}><Box sx={{ color: "text.secondary", width: 96 }}>Step before</Box><b>{when(start)}</b></Box>
            <Arrow label={`waits ${unitLabel(step.amount, step.unit)}`} />
            <Box sx={{ display: "flex", gap: 1 }}><Box sx={{ color: "text.secondary", width: 96 }}>Next step</Box><b>{when(next)}</b></Box>
            {deferred && <Typography sx={{ fontSize: 12.5, color: "#b26a00" }}>Pushed to 08:00 by quiet hours.</Typography>}
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
        const due = addMinutes(start, step.inDays * 1440);
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
            <LeadRowMock stage="Contacted" tags={["Seller"]} />
            <Arrow label="tag added" />
            <LeadRowMock stage="Contacted" tags={["Seller"]} newTag={step.tag} highlight="tag" />
          </>
        );
        break;
      case "branch": {
        const yesLabel = step.check === "email_opened" ? "She opened it" : step.check === "has_email" ? "She has an email" : `${BRANCH_LABEL[step.check]} "${step.value || "…"}"`;
        body = (
          <>
            <Typography sx={{ fontSize: 13.5 }}>The workflow checks {SAMPLE_LEAD.name.split(" ")[0]}: <b>{stepSummary(step)}</b></Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
              <Box sx={{ border: "1px solid #a5d6a7", bgcolor: "#e8f5e9", borderRadius: "4px", p: 1, fontSize: 12.5 }}>
                <b style={{ color: "#1b5e20" }}>Yes</b><br />{yesLabel} → follows the Yes path ({step.yes.length} step{step.yes.length === 1 ? "" : "s"})
              </Box>
              <Box sx={{ border: `1px solid ${tokens.divider}`, bgcolor: tokens.surface2, borderRadius: "4px", p: 1, fontSize: 12.5 }}>
                <b>No</b><br />Otherwise → follows the No path ({step.no.length} step{step.no.length === 1 ? "" : "s"})
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
