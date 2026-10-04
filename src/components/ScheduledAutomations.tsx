import { useState } from "react";
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box, Chip, IconButton, InputAdornment, ListItemIcon, Menu, MenuItem, Skeleton, Switch, Tab, Table, TableBody,
  TableCell, TableHead, TableRow, Tabs, TextField, Tooltip, Typography, useMediaQuery,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PauseIcon from "@mui/icons-material/PauseCircleOutlineOutlined";
import PlayIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import SendIcon from "@mui/icons-material/SendOutlined";
import SkipIcon from "@mui/icons-material/BlockOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { tokens } from "../theme";
import { getActiveAgentId, getActiveAgentIdSync, listAgentProfiles } from "../api/_client";
import { getMyProfile } from "../api/agentProfile";
import { getAccountAutomationsPaused, setAccountAutomationsPaused } from "../api/automations";
import { listScheduledWorkflowRuns, updateWorkflowRun, type WorkflowRunRow } from "../api/workflows";
import { stepAtPos, stepTitle, type Step } from "../lib/workflow";
import { useSnack } from "../hooks/useSnack";
import { workflowPath, type BackTo } from "../lib/automationsPaths";
import { PlainHead, SortHead, sortRows, useTableSort } from "./SortHead";
import { trackActivity } from "../lib/activity";

// What's about to go out: every queued workflow step, soonest first, in the
// same table look as the workflow list. Each row has pause / send now / skip.
// Clicking a row opens its workflow with that lead's place highlighted; the
// lead's name opens the lead. ?view=all shows every account.

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
  run: { id: string; status: WorkflowRunRow["status"]; workflowId: string | null; lead: { id: string; name: string } };
  isWhatsApp: boolean;
  sendAt: Date;
  held: boolean;
  workflow: string;
  step: string;
  account: string;
}

const SORT_KEYS = ["lead", "account", "workflow", "step", "when", "status"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function StatusChip({ run }: { run: { status: string } }) {
  if (run.status === "paused") return <Chip size="small" label="Paused" variant="outlined" sx={{ height: 22, fontSize: 12, fontWeight: 600 }} />;
  if (run.status === "processing") return <Chip size="small" label="Sending" color="primary" sx={{ height: 22, fontSize: 12, fontWeight: 600 }} />;
  return <Chip size="small" label="Scheduled" color="success" sx={{ height: 22, fontSize: 12, fontWeight: 600 }} />;
}

export default function ScheduledAutomations() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const showSnack = useSnack();
  const isDesktop = useMediaQuery("(min-width:900px)");
  // "account" = just the account you're switched into; "all" = every client's
  // queue in one list, so nothing about to go out is hidden behind a switcher.
  const [params, setParams] = useSearchParams();
  const scope: "account" | "all" = params.get("view") === "all" ? "all" : "account";
  const setScope = (v: "account" | "all") => setParams((p) => { const n = new URLSearchParams(p); if (v === "all") n.set("view", "all"); else n.delete("view"); return n; }, { replace: true });
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<{ el: HTMLElement; run: Row["run"] } | null>(null);
  const allAccounts = scope === "all";
  const agentKey = getActiveAgentIdSync() ?? "me";
  const pausedKey = ["automationsPaused", agentKey];
  const { sort, onSort } = useTableSort<SortKey>("estatekit_scheduled_sort", { k: "when", dir: "asc" }, SORT_KEYS);

  const { data: profile } = useQuery({ queryKey: ["myProfile"], queryFn: getMyProfile, staleTime: 5 * 60_000 });
  // Only needed to name the owner of each run in the all-accounts view.
  const { data: agentProfiles = [] } = useQuery({
    queryKey: ["agentProfiles"],
    queryFn: listAgentProfiles,
    enabled: allAccounts,
    staleTime: 5 * 60_000,
  });
  const agentName = (id: string) => {
    const p = agentProfiles.find((a) => a.agent_id === id);
    return p?.display_name || p?.company || "Unknown account";
  };
  const wfRunsKey = ["scheduledWorkflowRuns", allAccounts ? "all" : agentKey];
  const { data: wfRuns = [], isLoading } = useQuery({
    queryKey: wfRunsKey,
    queryFn: async () => listScheduledWorkflowRuns(allAccounts ? null : await getActiveAgentId()),
    refetchInterval: 30_000,
  });
  const { data: accountPaused = false } = useQuery({
    queryKey: pausedKey,
    queryFn: async () => getAccountAutomationsPaused(await getActiveAgentId()),
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [togglingAccount, setTogglingAccount] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: wfRunsKey });

  async function act(run: { id: string }, patch: Patch, message: string, undo?: Patch) {
    setMenu(null);
    setBusyId(run.id);
    const apply = (p: Patch) => updateWorkflowRun(run.id, p);
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

  async function toggleAccount(paused: boolean) {
    setTogglingAccount(true);
    try {
      const accountId = await getActiveAgentId();
      await setAccountAutomationsPaused(accountId, paused);
      trackActivity("automation_toggled", { agentId: accountId, detail: paused ? "Paused all automations for this account" : "Turned automations back on for this account" });
      await Promise.all([qc.invalidateQueries({ queryKey: pausedKey }), refresh()]);
      showSnack(paused ? "Automations paused for this account" : "Automations back on for this account");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't change that. Try again.");
    } finally {
      setTogglingAccount(false);
    }
  }

  // Everything a row shows, worked out once so sorting and search see the
  // same values. A weekday summary has no lead.
  const rows = wfRuns.map((w): Row => {
    const step = workflowStepAt(w);
    const isWhatsApp = step?.type === "whatsapp_agent";
    const def = w.workflow?.definition;
    const quietHoursApply = (isWhatsApp && def?.trigger?.kind !== "lead_created" && def?.settings?.quietHours !== false) || (step?.type === "email_lead" && !!def?.settings?.quietHours);
    const sendAt = effectiveSendTime(w.run_at, quietHoursApply);
    return {
      run: { id: w.id, status: w.status, workflowId: w.workflow?.id ?? null, lead: { id: w.lead?.id ?? "", name: w.lead?.name ?? "Daily summary" } },
      isWhatsApp, sendAt,
      held: quietHoursApply && sendAt.getTime() > Math.max(Date.parse(w.run_at), Date.now()) + 60_000,
      workflow: w.workflow?.name ?? "Workflow",
      step: step ? (step.type === "whatsapp_agent" ? "WhatsApp message" : step.type === "email_lead" ? "Email to the lead" : stepTitle(step)) : "Finishes the workflow",
      account: allAccounts ? agentName(w.agent_id) : "",
    };
  });
  const needle = q.trim().toLowerCase();
  const shown = sortRows(
    rows.filter((r) => !needle || `${r.run.lead.name} ${r.workflow} ${r.step} ${r.account}`.toLowerCase().includes(needle)),
    (r) => (sort.k === "lead" ? r.run.lead.name : sort.k === "account" ? r.account : sort.k === "workflow" ? r.workflow
      : sort.k === "step" ? r.step : sort.k === "status" ? r.run.status : r.sendAt.getTime()),
    sort.dir,
  );

  const whenCell = (r: Row) => (
    <>
      <Typography component="span" sx={{ fontSize: 13, fontWeight: 500, color: r.run.status === "paused" ? "text.secondary" : tokens.primary }}>
        {r.run.status === "processing" ? "Sending now" : relative(r.sendAt)}
      </Typography>
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
        {whenLabel(r.sendAt)}
        {r.held && <Tooltip title="Follow-up messages only send 08:00–20:00. This one waits for the morning."><span> · after quiet hours</span></Tooltip>}
      </Typography>
    </>
  );
  const stepCell = (r: Row) => (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, whiteSpace: "nowrap" }}>
      {r.isWhatsApp && <WhatsAppIcon sx={{ fontSize: 15, color: "text.secondary" }} />}
      {r.step}
    </Box>
  );
  const menuButton = (r: Row) => (
    <IconButton
      size="small"
      aria-label={`Actions for ${r.run.lead.name}`}
      disabled={busyId === r.run.id || r.run.status === "processing"}
      onClick={(e) => { e.stopPropagation(); setMenu({ el: e.currentTarget, run: r.run }); }}
    >
      <MoreVertIcon fontSize="small" />
    </IconButton>
  );

  // Open the workflow at this lead's place; Back in the editor returns here.
  const back: BackTo = { to: `${location.pathname}${location.search}`, label: "Scheduled" };
  const open = (r: Row) => { if (r.run.workflowId) navigate(`${workflowPath(r.run.workflowId)}?run=${r.run.id}`, { state: { back } }); };
  const leadName = (r: Row) =>
    r.run.lead.id ? (
      <Box component={RouterLink} to={`/leads/${r.run.lead.id}`} onClick={(e: React.MouseEvent) => e.stopPropagation()} sx={{ color: "inherit", textDecorationColor: tokens.line, "&:hover": { textDecorationColor: "inherit" } }}>
        {r.run.lead.name}
      </Box>
    ) : r.run.lead.name;

  const m = menu?.run;
  const mWhatsApp = m ? rows.find((r) => r.run.id === m.id)?.isWhatsApp : false;

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto", p: 2, pb: 6 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 500 }}>Scheduled</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Everything workflows are about to do, soonest first. Pause, send now or skip any of it.
          </Typography>
        </Box>
        {/* Account-wide switch. Only in single-account view: pausing is a
            per-account setting, so it means nothing across the combined list. */}
        {!allAccounts && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, pl: 1.5, border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper" }}>
            <Typography sx={{ fontSize: 13 }}>
              {profile?.displayName || "This account"}: <b>{accountPaused ? "Paused" : "On"}</b>
            </Typography>
            <Switch
              checked={!accountPaused}
              disabled={togglingAccount}
              onChange={(e) => toggleAccount(!e.target.checked)}
              slotProps={{ input: { "aria-label": "Automations on for this account" } }}
            />
          </Box>
        )}
      </Box>

      {!allAccounts && accountPaused && (
        <Typography sx={{ fontSize: 13, color: tokens.orange, mb: 1.5 }}>
          Automations are paused for this account. Nothing below will send until you turn them back on.
        </Typography>
      )}

      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <Tabs value={scope} onChange={(_, v) => setScope(v)} sx={{ minHeight: 40, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600, px: 1.5, minWidth: 0 } }}>
          <Tab value="account" label="This account" />
          <Tab value="all" label="All accounts" />
        </Tabs>
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small"
          placeholder="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ width: { xs: "100%", sm: 260 } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
      </Box>

      <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", overflow: "hidden" }}>
        {isLoading ? (
          <Box sx={{ p: 2 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={40} />)}</Box>
        ) : isDesktop ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <SortHead k="lead" label="Lead" sort={sort} onSort={onSort} />
                {allAccounts && <SortHead k="account" label="Account" sort={sort} onSort={onSort} />}
                <SortHead k="workflow" label="Workflow" sort={sort} onSort={onSort} />
                <SortHead k="step" label="Next step" sort={sort} onSort={onSort} />
                <SortHead k="when" label="When (SAST)" sort={sort} onSort={onSort} />
                <SortHead k="status" label="Status" sort={sort} onSort={onSort} />
                <PlainHead sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((r) => (
                <TableRow
                  key={r.run.id}
                  hover
                  onClick={() => open(r)}
                  sx={{ cursor: "pointer", opacity: busyId === r.run.id ? 0.5 : 1, "&:last-child td": { borderBottom: 0 }, "& td": { py: 1.25 } }}
                >
                  <TableCell sx={{ fontWeight: 500, fontSize: 14 }}>{leadName(r)}</TableCell>
                  {allAccounts && <TableCell sx={{ fontSize: 13 }}>{r.account}</TableCell>}
                  <TableCell sx={{ fontSize: 13, color: "text.secondary" }}>{r.workflow}</TableCell>
                  <TableCell sx={{ fontSize: 13 }}>{stepCell(r)}</TableCell>
                  <TableCell>{whenCell(r)}</TableCell>
                  <TableCell><StatusChip run={r.run} /></TableCell>
                  <TableCell padding="checkbox">{menuButton(r)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          shown.map((r, i) => (
            <Box
              key={r.run.id}
              onClick={() => open(r)}
              sx={{ display: "flex", alignItems: "center", gap: 1, borderTop: i ? `1px solid ${tokens.divider}` : 0, p: "12px 6px 12px 14px", minHeight: 64, cursor: "pointer", opacity: busyId === r.run.id ? 0.5 : 1 }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 500, fontSize: 14.5 }}>
                  {leadName(r)}
                  {allAccounts && <Box component="span" sx={{ fontWeight: 400, color: "text.secondary" }}> · {r.account}</Box>}
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{r.workflow}</Typography>
                <Typography sx={{ fontSize: 12.5 }}>{stepCell(r)}</Typography>
                <Box sx={{ mt: 0.25 }}>{whenCell(r)}</Box>
              </Box>
              <StatusChip run={r.run} />
              {menuButton(r)}
            </Box>
          ))
        )}
        {!isLoading && !shown.length && (
          <Typography sx={{ color: "text.secondary", textAlign: "center", py: 6 }}>
            {rows.length ? "Nothing matches." : allAccounts ? "Nothing scheduled on any account." : "Nothing scheduled for this account."}
          </Typography>
        )}
      </Box>

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
              const later = mWhatsApp && effectiveSendTime(new Date().toISOString(), true).getTime() > Date.now() + 60_000;
              act(m, { status: "pending", run_at: new Date().toISOString() }, later ? "Queued. Sends at 08:00 when quiet hours end" : "Sending within a minute");
            }}
          >
            <ListItemIcon><SendIcon fontSize="small" /></ListItemIcon>Send now
          </MenuItem>
        )}
        {m && (
          <MenuItem
            sx={{ color: tokens.red }}
            onClick={() => act(m, { status: "cancelled" }, "Skipped", { status: m.status === "paused" ? "paused" : "pending" })}
          >
            <ListItemIcon><SkipIcon fontSize="small" sx={{ color: tokens.red }} /></ListItemIcon>Skip
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}
