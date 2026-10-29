import { useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Chip, IconButton, ListItemIcon, Menu, MenuItem, Skeleton, Tooltip, Typography } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PauseIcon from "@mui/icons-material/PauseCircleOutlineOutlined";
import PlayIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import SendIcon from "@mui/icons-material/SendOutlined";
import SkipIcon from "@mui/icons-material/BlockOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { tokens } from "../theme";
import { getAccountAutomationsPaused } from "../api/automations";
import { listScheduledWorkflowRuns, updateWorkflowRun, type WorkflowRunRow } from "../api/workflows";
import { stepAtPos, stepTitle, type Step } from "../lib/workflow";
import { useSnack } from "../hooks/useSnack";
import { workflowPath, type BackTo } from "../lib/automationsPaths";

// What one workflow is about to do: its waiting leads, soonest first, each
// with pause / send now / skip. Opened from "N waiting" on the Automations
// list (it replaced the Scheduled tab, Oct 2026). Tapping a row opens the
// workflow at that lead's place; the name opens the lead.

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
  step: string;
}

function StatusChip({ status }: { status: string }) {
  if (status === "paused") return <Chip size="small" label="Paused" variant="outlined" sx={{ height: 22, fontSize: 12, fontWeight: 600 }} />;
  if (status === "processing") return <Chip size="small" label="Sending" color="primary" sx={{ height: 22, fontSize: 12, fontWeight: 600 }} />;
  return null;
}

/** One workflow's queue, or (no workflowId) the whole account's, each row
 *  naming its workflow. */
export default function WaitingList({ workflowId, agentId }: { workflowId?: string; agentId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [menu, setMenu] = useState<{ el: HTMLElement; row: Row } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const runsKey = ["scheduledWorkflowRuns", agentId];
  const { data: runs = [], isLoading } = useQuery({ queryKey: runsKey, queryFn: () => listScheduledWorkflowRuns(agentId), refetchInterval: 30_000 });
  const { data: accountPaused = false } = useQuery({ queryKey: ["automationsPaused", agentId], queryFn: () => getAccountAutomationsPaused(agentId) });

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: runsKey }), qc.invalidateQueries({ queryKey: ["workflowLeadCounts", agentId] })]);

  async function act(row: Row, patch: Patch, message: string, undo?: Patch) {
    setMenu(null);
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
      const isWhatsApp = step?.type === "whatsapp_agent";
      const def = w.workflow?.definition;
      const quietHoursApply = (isWhatsApp && def?.trigger?.kind !== "lead_created" && def?.settings?.quietHours !== false) || (step?.type === "email_lead" && !!def?.settings?.quietHours);
      const sendAt = effectiveSendTime(w.run_at, quietHoursApply);
      return {
        id: w.id, workflowId: w.workflow?.id ?? "", workflow: w.workflow?.name ?? "Automation", status: w.status, lead: { id: w.lead?.id ?? "", name: w.lead?.name ?? "Daily summary" }, isWhatsApp, sendAt,
        held: quietHoursApply && sendAt.getTime() > Math.max(Date.parse(w.run_at), Date.now()) + 60_000,
        step: step ? (step.type === "whatsapp_agent" ? "WhatsApp to the agent" : step.type === "whatsapp_lead" ? "WhatsApp to the lead" : step.type === "email_lead" ? "Email to the lead" : stepTitle(step)) : "Finishes the workflow",
      };
    })
    .sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime());

  const back: BackTo = { to: `${location.pathname}${location.search}`, label: "Automations" };
  const m = menu?.row;

  if (isLoading) return <Box sx={{ p: 2 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={48} />)}</Box>;

  return (
    <Box>
      {accountPaused && (
        <Typography sx={{ fontSize: 13, color: tokens.orange, px: 2, pt: 1.5 }}>
          Automations are paused for this account. Nothing here sends until they're back on.
        </Typography>
      )}
      {rows.map((r, i) => (
        <Box
          key={r.id}
          onClick={() => navigate(`${workflowPath(r.workflowId)}?run=${r.id}`, { state: { back } })}
          sx={{ display: "flex", alignItems: "center", gap: 1, borderTop: i ? `1px solid ${tokens.divider}` : 0, p: "10px 6px 10px 16px", minHeight: 60, cursor: "pointer", opacity: busyId === r.id ? 0.5 : 1, "&:hover": { bgcolor: tokens.hover } }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 500, fontSize: 14.5 }} noWrap>
              {r.lead.id ? (
                <Box component={RouterLink} to={`/leads/${r.lead.id}`} onClick={(e: React.MouseEvent) => e.stopPropagation()} sx={{ color: "inherit", textDecorationColor: tokens.line, "&:hover": { textDecorationColor: "inherit" } }}>
                  {r.lead.name}
                </Box>
              ) : r.lead.name}
            </Typography>
            <Typography component="div" sx={{ fontSize: 12.5, color: "text.secondary", display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
              {r.isWhatsApp && <WhatsAppIcon sx={{ fontSize: 14 }} />}
              <span>{workflowId ? r.step : r.workflow} ·</span>
              <Box component="span" sx={{ color: r.status === "paused" ? "text.secondary" : tokens.primary, fontWeight: 500 }}>
                {r.status === "processing" ? "Sending now" : relative(r.sendAt)}
              </Box>
              <span>({whenLabel(r.sendAt)})</span>
              {r.held && <Tooltip title="Follow-up messages only send 08:00–20:00. This one waits for the morning."><span>· after quiet hours</span></Tooltip>}
            </Typography>
          </Box>
          <StatusChip status={r.status} />
          <IconButton
            aria-label={`Pause, send now or skip for ${r.lead.name}`}
            disabled={busyId === r.id || r.status === "processing"}
            onClick={(e) => { e.stopPropagation(); setMenu({ el: e.currentTarget, row: r }); }}
            sx={{ width: 44, height: 44 }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      {!rows.length && <Typography sx={{ color: "text.secondary", textAlign: "center", py: 5 }}>{workflowId ? "Nobody is waiting in this one right now." : "Nothing is waiting to go out."}</Typography>}

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        {m && (m.status === "paused" ? (
          <MenuItem disabled={accountPaused} onClick={() => act(m, { status: "pending" }, "Resumed")}>
            <ListItemIcon><PlayIcon fontSize="small" /></ListItemIcon>Resume
          </MenuItem>
        ) : (
          <MenuItem onClick={() => act(m, { status: "paused" }, "Paused", { status: "pending" })}>
            <ListItemIcon><PauseIcon fontSize="small" /></ListItemIcon>Pause
          </MenuItem>
        ))}
        {m && (
          <MenuItem
            disabled={accountPaused}
            onClick={() => {
              const later = m.isWhatsApp && effectiveSendTime(new Date().toISOString(), true).getTime() > Date.now() + 60_000;
              act(m, { status: "pending", run_at: new Date().toISOString() }, later ? "Queued. Sends at 08:00 when quiet hours end" : "Sending within a minute");
            }}
          >
            <ListItemIcon><SendIcon fontSize="small" /></ListItemIcon>Send now
          </MenuItem>
        )}
        {m && (
          <MenuItem sx={{ color: tokens.red }} onClick={() => act(m, { status: "cancelled" }, "Skipped", { status: m.status === "paused" ? "paused" : "pending" })}>
            <ListItemIcon><SkipIcon fontSize="small" sx={{ color: tokens.red }} /></ListItemIcon>Skip
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}
