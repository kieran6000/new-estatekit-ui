import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchIcon from "@mui/icons-material/Search";
import SendIcon from "@mui/icons-material/Send";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { tokens } from "../theme";
import { weekLabel, weekStartDate } from "../api/weeklyReport";
import { listReportAgents, listReportSends, sendWeeklyReport, ReportsNotSetUp, type ReportAgent, type ReportSend } from "../api/weeklyReportSends";
import { useSnack } from "../hooks/useSnack";

// Weekly reports, for the CSM: one row per client, one Send button each.
// Send works out the report as it stands, saves that copy and WhatsApps the
// agent a link (/r/<token>). The row then shows when it went, who sent it,
// and whether the agent has opened it.
//
// Sends run one at a time, ~6 s apart: the WhatsApp sender rejects anything
// faster, so clicking Send down the list just queues them.

const GAP_MS = 6500;

type Pending = "queued" | "sending";
type View = "all" | "not_sent" | "not_opened";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function WeeklyReportsAdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showSnack = useSnack();
  const isDesktop = useMediaQuery("(min-width:900px)");
  const [weeksBack, setWeeksBack] = useState(0);
  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<Record<string, Pending>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ ids: string[]; title: string; text: string } | null>(null);

  const weekStart = weekStartDate(weeksBack);
  const { data: agents = [], isLoading: loadingAgents } = useQuery({ queryKey: ["reportAgents"], queryFn: listReportAgents });
  const { data: sends = [], isLoading: loadingSends, error: sendsError } = useQuery({ queryKey: ["reportSends"], queryFn: listReportSends, retry: false });
  const notSetUp = sendsError instanceof ReportsNotSetUp;

  // ── The send queue ────────────────────────────────────────────────────
  const queue = useRef<{ id: string; weeksBack: number }[]>([]);
  const running = useRef(false);
  const lastSendAt = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length && mounted.current) {
      const job = queue.current.shift()!;
      const wait = lastSendAt.current + GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setPending((p) => ({ ...p, [job.id]: "sending" }));
      try {
        await sendWeeklyReport(job.id, job.weeksBack);
        setErrors(({ [job.id]: _gone, ...rest }) => rest);
      } catch (e) {
        setErrors((x) => ({ ...x, [job.id]: e instanceof Error ? e.message : "Didn't send" }));
      } finally {
        lastSendAt.current = Date.now();
        setPending(({ [job.id]: _done, ...rest }) => rest);
        void qc.invalidateQueries({ queryKey: ["reportSends"] });
      }
    }
    running.current = false;
  }, [qc]);

  const enqueue = useCallback((ids: string[]) => {
    const fresh = ids.filter((id) => !queue.current.some((j) => j.id === id));
    if (!fresh.length) return;
    queue.current.push(...fresh.map((id) => ({ id, weeksBack })));
    setPending((p) => ({ ...p, ...Object.fromEntries(fresh.map((id) => [id, p[id] ?? "queued"])) }));
    void run();
  }, [run, weeksBack]);

  // Leaving with sends still queued would silently drop them.
  useEffect(() => {
    const busy = Object.keys(pending).length > 0;
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  // ── Rows ──────────────────────────────────────────────────────────────
  const rows = useMemo(() => agents.map((a) => {
    const mine = sends.filter((s) => s.agent_id === a.agent_id);
    return {
      agent: a,
      thisWeek: mine.find((s) => s.week_start === weekStart) ?? null,
      lastSent: mine.find((s) => s.status === "sent") ?? null,
    };
  }), [agents, sends, weekStart]);

  const sentOk = (r: (typeof rows)[number]) => r.thisWeek?.status === "sent";
  const counts = {
    total: rows.length,
    sent: rows.filter(sentOk).length,
    opened: rows.filter((r) => sentOk(r) && r.thisWeek?.first_opened_at).length,
  };
  const notSentIds = rows.filter((r) => !sentOk(r) && hasWhatsApp(r.agent) && !pending[r.agent.agent_id]).map((r) => r.agent.agent_id);

  const shown = rows.filter((r) => {
    if (q.trim() && !(r.agent.display_name ?? "").toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (view === "not_sent") return !sentOk(r);
    if (view === "not_opened") return sentOk(r) && !r.thisWeek?.first_opened_at;
    return true;
  });

  const onSend = (r: (typeof rows)[number]) => {
    if (sentOk(r)) {
      setConfirm({
        ids: [r.agent.agent_id],
        title: `Send again to ${r.agent.display_name}?`,
        text: `They already got the report for ${weekLabel(weeksBack)} (${when(r.thisWeek!.sent_at)}). Sending again sends a fresh link with today's numbers.`,
      });
    } else {
      enqueue([r.agent.agent_id]);
    }
  };

  const loading = loadingAgents || loadingSends;

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/admin/clients")} aria-label="Back to accounts">
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500, flex: 1 }}>Weekly reports</Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 1100, mx: "auto", p: 2, pb: 8 }}>
        {notSetUp && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Sending isn't switched on yet: the reports table hasn't been created. Run
            <b> supabase/migrations/20261002_0001_weekly_report_sends.sql</b> in the Supabase SQL Editor, then refresh.
          </Alert>
        )}

        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, mb: 1.5 }}>
          <TextField
            select
            size="small"
            label="Report for the week"
            value={weeksBack}
            onChange={(e) => setWeeksBack(Number(e.target.value))}
            sx={{ minWidth: 240 }}
          >
            {[0, 1, 2, 3].map((n) => (
              <MenuItem key={n} value={n}>{weekLabel(n)}{n === 0 ? " (last week)" : ""}</MenuItem>
            ))}
          </TextField>
          <Box sx={{ flex: 1, minWidth: 160 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
              {loading ? "Loading…" : `${counts.sent} of ${counts.total} sent · ${counts.opened} opened`}
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Each agent gets a WhatsApp with a link to their report.</Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<SendIcon />}
            disabled={loading || notSetUp || notSentIds.length === 0}
            onClick={() => setConfirm({ ids: notSentIds, title: `Send to ${notSentIds.length} agent${notSentIds.length === 1 ? "" : "s"}?`, text: `Everyone who hasn't had the report for ${weekLabel(weeksBack)} yet. They go out one by one, about ${Math.ceil((notSentIds.length * GAP_MS) / 60000)} min in total. Keep this page open until they're done.` })}
          >
            Send to all not sent{notSentIds.length ? ` (${notSentIds.length})` : ""}
          </Button>
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mb: 1.5 }}>
          <Tabs value={view} onChange={(_, v) => setView(v)} sx={{ minHeight: 40, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600, px: 1.5, minWidth: 0 } }}>
            <Tab value="all" label={`All (${counts.total})`} />
            <Tab value="not_sent" label={`Not sent (${counts.total - counts.sent})`} />
            <Tab value="not_opened" label={`Not opened (${counts.sent - counts.opened})`} />
          </Tabs>
          <Box sx={{ flex: 1 }} />
          <TextField
            size="small"
            placeholder="Find an agent"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            sx={{ width: 240, maxWidth: "100%" }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
        </Box>

        <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", overflow: "hidden" }}>
          {isDesktop && (
            <Box sx={{ display: "grid", gridTemplateColumns: COLS, gap: 2, px: 2, py: 1, bgcolor: tokens.surface2, color: "text.secondary", fontSize: 12.5, fontWeight: 500 }}>
              <span>Agent</span><span>This report</span><span>Opened</span><span />
            </Box>
          )}
          {loading && <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress size={28} /></Box>}
          {!loading && shown.map((r, i) => (
            <Row
              key={r.agent.agent_id}
              first={i === 0}
              desktop={isDesktop}
              agent={r.agent}
              thisWeek={r.thisWeek}
              lastSent={r.lastSent}
              pending={pending[r.agent.agent_id]}
              error={errors[r.agent.agent_id]}
              disabled={notSetUp}
              weeksBack={weeksBack}
              onSend={() => onSend(r)}
            />
          ))}
          {!loading && !shown.length && (
            <Typography sx={{ textAlign: "center", color: "text.secondary", py: 6 }}>
              {view === "not_sent" ? "Everyone has this week's report." : view === "not_opened" ? "Everyone who got it has opened it." : "No agents match."}
            </Typography>
          )}
        </Box>
      </Box>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)}>
        <DialogTitle>{confirm?.title}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 15 }}>{confirm?.text}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (confirm) {
                enqueue(confirm.ids);
                if (confirm.ids.length > 1) showSnack(`Sending ${confirm.ids.length} reports, one by one`);
              }
              setConfirm(null);
            }}
          >
            Send
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

const COLS = "minmax(200px, 1.3fr) minmax(200px, 1.4fr) minmax(150px, 1fr) 210px";

function hasWhatsApp(a: ReportAgent): boolean {
  return (a.whatsapp_number ?? "").replace(/\D/g, "").length >= 9;
}

function Row({
  first, desktop, agent, thisWeek, lastSent, pending, error, disabled, weeksBack, onSend,
}: {
  first: boolean;
  desktop: boolean;
  agent: ReportAgent;
  thisWeek: ReportSend | null;
  lastSent: ReportSend | null;
  pending?: Pending;
  error?: string;
  disabled: boolean;
  weeksBack: number;
  onSend: () => void;
}) {
  const name = agent.display_name || "Unnamed agent";
  const sent = thisWeek?.status === "sent";
  const failed = !pending && (error || thisWeek?.status === "failed");
  const noWa = !hasWhatsApp(agent);

  const status = pending ? (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary", fontSize: 13.5 }}>
      <CircularProgress size={14} /> {pending === "sending" ? "Sending…" : "Waiting to send…"}
    </Box>
  ) : failed ? (
    <Typography sx={{ fontSize: 13.5, color: tokens.red }}>Didn't send: {error || thisWeek?.error || "try again"}</Typography>
  ) : sent ? (
    <Box>
      <Typography sx={{ fontSize: 13.5 }}>Sent {when(thisWeek!.sent_at)}</Typography>
      {thisWeek!.sent_by_name && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>by {thisWeek!.sent_by_name}</Typography>}
    </Box>
  ) : (
    <Box>
      <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>Not sent</Typography>
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
        {lastSent ? `Last sent: ${lastSent.period.replace(/, \d{4}$/, "")}` : "Never sent"}
      </Typography>
    </Box>
  );

  const opened = sent && !pending ? (
    thisWeek!.first_opened_at ? (
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.75 }}>
        <CheckCircleIcon sx={{ fontSize: 17, color: tokens.green, mt: "1px" }} />
        <Box>
          <Typography sx={{ fontSize: 13.5 }}>Opened {when(thisWeek!.first_opened_at)}</Typography>
          {thisWeek!.open_count > 1 && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{thisWeek!.open_count} times</Typography>}
        </Box>
      </Box>
    ) : <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>Not opened yet</Typography>
  ) : <Typography sx={{ fontSize: 13.5, color: "text.disabled" }}>—</Typography>;

  const actions = (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "flex-end" }}>
      <Tooltip title="See the report first">
        <IconButton component="a" href={`/report/${agent.agent_id}?w=${weeksBack}`} target="_blank" rel="noopener" aria-label={`Preview ${name}'s report`}>
          <VisibilityOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={noWa ? "No WhatsApp number on this account" : ""}>
        <span>
          <Button
            variant={sent ? "outlined" : "contained"}
            startIcon={pending ? undefined : <SendIcon />}
            disabled={disabled || noWa || !!pending}
            onClick={onSend}
            sx={{ minWidth: 132, whiteSpace: "nowrap" }}
          >
            {pending ? "Queued" : failed ? "Retry" : sent ? "Send again" : "Send"}
          </Button>
        </span>
      </Tooltip>
    </Box>
  );

  const who = (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
      <Avatar src={agent.avatar_url ?? undefined} sx={{ width: 32, height: 32, fontSize: 13 }}>{name[0]}</Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 14, fontWeight: 500 }}>{name}</Typography>
        <Typography noWrap sx={{ fontSize: 12, color: noWa ? tokens.red : "text.secondary" }}>{noWa ? "No WhatsApp number" : agent.whatsapp_number}</Typography>
      </Box>
    </Box>
  );

  if (desktop) {
    return (
      <Box sx={{ display: "grid", gridTemplateColumns: COLS, gap: 2, alignItems: "center", px: 2, py: 1.25, borderTop: first ? 0 : `1px solid ${tokens.divider2}` }}>
        {who}{status}{opened}{actions}
      </Box>
    );
  }
  return (
    <Box sx={{ px: 2, py: 1.5, borderTop: first ? 0 : `1px solid ${tokens.divider2}`, display: "grid", gap: 1 }}>
      {who}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>{status}{opened}</Box>
      {actions}
    </Box>
  );
}
