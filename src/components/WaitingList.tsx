import { useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Button, Skeleton, Typography } from "@mui/material";
import PauseIcon from "@mui/icons-material/PauseCircleOutlineOutlined";
import PlayIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import SendIcon from "@mui/icons-material/SendOutlined";
import SkipIcon from "@mui/icons-material/BlockOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { tokens } from "../theme";
import { getAccountAutomationsPaused } from "../api/automations";
import { listScheduledWorkflowRuns, updateWorkflowRun, type WorkflowRunRow } from "../api/workflows";
import { fieldInfo, stepAtPos, stepTitle, type Step, type Trigger } from "../lib/workflow";
import { useSnack } from "../hooks/useSnack";
import { workflowPath, type BackTo } from "../lib/automationsPaths";

// What is about to go out: each waiting message, soonest first, with the
// message itself on the row (the lead's name filled in). Tap a row for all
// of it and send now / pause / skip. The Automations sidebar's "Coming up"
// tab (it replaced the Scheduled tab, Oct 2026).

// Mirrors run-automations: follow-up WhatsApps only send 08:00–20:00 SAST
// (UTC+2). New-lead alerts are exempt there, so callers pass quietHours=false
// for those — keep the two in step or this preview lies about send times.
const SAST_OFFSET = 2;

function effectiveSendTime(runAtIso: string, quietHours: boolean): Date {
  const t = new Date(Math.max(Date.parse(runAtIso), Date.now()));
  if (!quietHours) return t;
  const hour = (t.getUTCHours() + SAST_OFFSET) % 24;
  if (hour >= 8 && hour < 20) return t;
  const next = new Date(t);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(8 - SAST_OFFSET);
  if (next <= t) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function relative(d: Date): string {
  const mins = Math.round((d.getTime() - Date.now()) / 60_000);
  if (mins <= 1) return "Sending now";
  if (mins < 60) return `In ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `In ${hrs}h`;
  return `In ${Math.round(hrs / 24)}d`;
}

const whenLabel = (d: Date) =>
  d.toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The step a workflow run is about to do, from its position in the tree. */
const workflowStepAt = (run: WorkflowRunRow): Step | undefined => stepAtPos((run.workflow?.definition?.steps ?? []) as Step[], run.pos);

type Patch = { status?: "pending" | "paused" | "cancelled"; run_at?: string };

interface Row {
  id: string;
  workflowId: string;
  workflow: string;
  status: WorkflowRunRow["status"];
  lead: { id: string; name: string };
  isWhatsApp: boolean;
  sendAt: Date;
  held: boolean;
  /** "WhatsApp to the agent", "Email to the lead", or the step's name. */
  what: string;
  /** The message as it will go out, the lead's name filled in; "" for steps that send nothing. */
  message: string;
  subject: string;
}

/** A message with this lead's name in it; other details by their plain name. */
function fillFor(text: string, leadName: string | null, trigger: Trigger | undefined): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, f: string) => {
    if (leadName && f === "first_name") return leadName.split(/\s+/)[0];
    if (leadName && f === "name") return leadName;
    return `[${fieldInfo(f, trigger).label}]`;
  });
}

/** One workflow's queue, or (no workflowId) the whole account's. Each row
 *  shows the message itself; tap it for all of it and send now / pause /
 *  skip. */
export default function WaitingList({ workflowId, agentId }: { workflowId?: string; agentId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [open, setOpen] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const runsKey = ["scheduledWorkflowRuns", agentId];
  const { data: runs = [], isLoading } = useQuery({ queryKey: runsKey, queryFn: () => listScheduledWorkflowRuns(agentId), refetchInterval: 30_000 });
  const { data: accountPaused = false } = useQuery({ queryKey: ["automationsPaused", agentId], queryFn: () => getAccountAutomationsPaused(agentId) });

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: runsKey }), qc.invalidateQueries({ queryKey: ["workflowLeadCounts", agentId] })]);

  async function act(row: Row, patch: Patch, message: string, undo?: Patch) {
    setBusyId(row.id);
    const apply = (p: Patch) => updateWorkflowRun(row.id, p);
    try {
      await apply(patch);
      await refresh();
      showSnack(message, undo ? () => { void apply(undo).then(refresh); } : undefined);
    } catch (e) {
      console.error(e);
      showSnack("Couldn't update that. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  // A weekday summary has no lead.
  const rows = runs
    .filter((w) => !workflowId || w.workflow?.id === workflowId)
    .map((w): Row => {
      const step = workflowStepAt(w);
      const isWhatsApp = step?.type === "whatsapp_agent" || step?.type === "whatsapp_lead";
      const def = w.workflow?.definition;
      const trigger = def?.trigger as Trigger | undefined;
      const quietHoursApply = (step?.type === "whatsapp_agent" && def?.trigger?.kind !== "lead_created" && def?.settings?.quietHours !== false) || (step?.type === "email_lead" && !!def?.settings?.quietHours);
      const sendAt = effectiveSendTime(w.run_at, quietHoursApply);
      const leadName = w.lead?.name ?? null;
      const message = step?.type === "whatsapp_agent" || step?.type === "whatsapp_lead" ? fillFor(step.text, leadName, trigger)
        : step?.type === "email_lead" ? fillFor(step.body, leadName, trigger) : "";
      return {
        id: w.id, workflowId: w.workflow?.id ?? "", workflow: w.workflow?.name ?? "Automation", status: w.status,
        lead: { id: w.lead?.id ?? "", name: leadName ?? "Daily summary" }, isWhatsApp, sendAt,
        held: quietHoursApply && sendAt.getTime() > Math.max(Date.parse(w.run_at), Date.now()) + 60_000,
        what: step ? (step.type === "whatsapp_agent" ? "WhatsApp to the agent" : step.type === "whatsapp_lead" ? "WhatsApp to the lead" : step.type === "email_lead" ? "Email to the lead" : stepTitle(step)) : "Finishes the automation",
        message,
        subject: step?.type === "email_lead" ? fillFor(step.subject, leadName, trigger) : "",
      };
    })
    .sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime());

  const back: BackTo = { to: `${location.pathname}${location.search}`, label: "Automations" };

  if (isLoading) return <Box sx={{ p: 2 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={64} />)}</Box>;

  return (
    <Box>
      {accountPaused && (
        <Typography sx={{ fontSize: 13, color: tokens.orange, px: 2, pt: 1.5 }}>
          Automations are paused for this account. Nothing here sends until they're back on.
        </Typography>
      )}
      {rows.map((r) => {
        const expanded = open === r.id;
        const busy = busyId === r.id;
        return (
          <Box key={r.id} sx={{ borderBottom: `1px solid ${tokens.divider}`, bgcolor: expanded ? tokens.hover : "transparent", opacity: busy ? 0.5 : 1 }}>
            <Box
              component="button"
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : r.id)}
              sx={{ display: "block", width: "100%", textAlign: "left", font: "inherit", color: "inherit", bgcolor: "transparent", border: 0, px: 2, py: 1.25, cursor: "pointer", "&:hover": { bgcolor: tokens.hover } }}
            >
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: 14.5, flex: 1, minWidth: 0 }} noWrap>{r.lead.name}</Typography>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600, flex: "none", color: r.status === "paused" ? "text.secondary" : tokens.primary }}>
                  {r.status === "paused" ? "Paused" : r.status === "processing" ? "Sending now" : relative(r.sendAt)}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 12.5, color: "text.secondary" }} noWrap>
                {r.what} · {whenLabel(r.sendAt)}{r.held ? " (after quiet hours)" : ""}
              </Typography>
              {r.message ? (
                <Box sx={{ mt: 0.75, display: "flex", gap: 0.75, alignItems: "flex-start" }}>
                  {r.isWhatsApp && <WhatsAppIcon sx={{ fontSize: 15, color: "#25d366", mt: "2px", flex: "none" }} />}
                  <Typography sx={{
                    fontSize: 13.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                    ...(expanded ? {} : { overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }),
                  }}>
                    {r.subject && <b>{r.subject}{expanded ? "\n\n" : " · "}</b>}{r.message}
                  </Typography>
                </Box>
              ) : null}
              {!workflowId && <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.5 }} noWrap>From: {r.workflow}</Typography>}
            </Box>

            {expanded && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, px: 2, pb: 1.5 }}>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<SendIcon />}
                  disabled={busy || accountPaused || r.status === "processing"}
                  onClick={() => {
                    const later = r.isWhatsApp && effectiveSendTime(new Date().toISOString(), true).getTime() > Date.now() + 60_000;
                    void act(r, { status: "pending", run_at: new Date().toISOString() }, later ? "Queued. Sends at 08:00 when quiet hours end" : "Sending within a minute");
                  }}
                >
                  Send now
                </Button>
                {r.status === "paused" ? (
                  <Button size="small" variant="outlined" startIcon={<PlayIcon />} disabled={busy || accountPaused} onClick={() => void act(r, { status: "pending" }, "Resumed")}>Resume</Button>
                ) : (
                  <Button size="small" variant="outlined" startIcon={<PauseIcon />} disabled={busy || r.status === "processing"} onClick={() => void act(r, { status: "paused" }, "Paused", { status: "pending" })}>Pause</Button>
                )}
                <Button size="small" variant="outlined" color="error" startIcon={<SkipIcon />} disabled={busy || r.status === "processing"} onClick={() => void act(r, { status: "cancelled" }, "Skipped", { status: r.status === "paused" ? "paused" : "pending" })}>Skip</Button>
                <Box sx={{ flex: 1 }} />
                {r.lead.id && <Button size="small" component={RouterLink} to={`/leads/${r.lead.id}`}>Open lead</Button>}
                {r.workflowId && <Button size="small" onClick={() => navigate(`${workflowPath(r.workflowId)}?run=${r.id}`, { state: { back } })}>Open automation</Button>}
              </Box>
            )}
          </Box>
        );
      })}
      {!rows.length && <Typography sx={{ color: "text.secondary", textAlign: "center", py: 5 }}>{workflowId ? "Nobody is waiting in this one right now." : "Nothing is waiting to go out."}</Typography>}
    </Box>
  );
}
