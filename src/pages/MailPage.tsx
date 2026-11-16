import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppBar, Box, Chip, CircularProgress, IconButton, Tab, Tabs, Toolbar, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import { tokens } from "../theme";
import {
  emailMetrics,
  listWorkflowEmails,
  WorkflowEmailsNotSetUp,
  type SentEmail,
} from "../api/workflowEmails";

const WINDOWS: { value: number; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

function sentAgo(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Metric({ label, value, tint, color }: { label: string; value: string; tint?: string; color?: string }) {
  return (
    <Box
      sx={{
        flex: "1 1 0",
        minWidth: 0,
        p: 1.5,
        bgcolor: tint ?? "background.paper",
        border: `1px solid ${tokens.divider}`,
        borderRadius: 1,
        textAlign: "center",
      }}
    >
      <Typography sx={{ fontSize: 22, fontWeight: 600, color: color ?? tokens.ink, lineHeight: 1.2 }}>{value}</Typography>
      <Typography sx={{ fontSize: 12, color: tokens.ink3, mt: 0.25 }}>{label}</Typography>
    </Box>
  );
}

function StatusChip({ e }: { e: SentEmail }) {
  if (e.bounced) return <Chip size="small" label="Bounced" sx={{ height: 22, fontSize: 11, bgcolor: tokens.redTint, color: tokens.red }} />;
  if (e.opened_at) return <Chip size="small" label="Opened" sx={{ height: 22, fontSize: 11, bgcolor: tokens.greenTint, color: tokens.greenDark }} />;
  return <Chip size="small" label="Sent" sx={{ height: 22, fontSize: 11, bgcolor: tokens.hover, color: tokens.ink2 }} />;
}

function Row({ e }: { e: SentEmail }) {
  const navigate = useNavigate();
  return (
    <Box
      onClick={() => navigate(`/leads/${e.lead_id}`)}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 2,
        py: 1.25,
        cursor: "pointer",
        borderBottom: `1px solid ${tokens.divider}`,
        "&:hover": { bgcolor: tokens.hover },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography noWrap sx={{ fontSize: 14, fontWeight: 500, color: tokens.ink }}>
            {e.lead_name || e.lead_email || "Lead"}
          </Typography>
          <StatusChip e={e} />
        </Box>
        <Typography noWrap sx={{ fontSize: 13, color: tokens.ink3, mt: 0.25 }}>
          {e.subject || "(no subject)"}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 12, color: tokens.ink3, whiteSpace: "nowrap" }}>{sentAgo(e.sent_at)}</Typography>
    </Box>
  );
}

export default function MailPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);

  const metrics = useQuery({
    queryKey: ["emailMetrics", days],
    queryFn: () => emailMetrics(days),
    staleTime: 60_000,
  });
  const emails = useQuery({
    queryKey: ["workflowEmails", days],
    queryFn: () => listWorkflowEmails(days),
    staleTime: 60_000,
  });

  const notSetUp = emails.error instanceof WorkflowEmailsNotSetUp || metrics.error instanceof WorkflowEmailsNotSetUp;
  const m = metrics.data;
  const list = emails.data ?? [];
  const pct = useMemo(() => (m ? `${Math.round(m.openRate * 100)}%` : "—"), [m]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton edge="start" onClick={() => navigate(-1)} aria-label="Back"><ArrowBackIcon /></IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Mail</Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Box sx={{ maxWidth: 720, mx: "auto" }}>
          <Tabs value={days} onChange={(_e, v) => setDays(v)}>
            {WINDOWS.map((w) => <Tab key={w.value} value={w.value} label={w.label} />)}
          </Tabs>
        </Box>
      </Box>

      <Box sx={{ maxWidth: 720, mx: "auto", p: { xs: 1.5, md: 2.5 } }}>
        {/* Metrics */}
        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <Metric label="Sent" value={m ? String(m.sent) : "—"} />
          <Metric label="Open rate" value={pct} tint={tokens.greenTint} color={tokens.greenDark} />
          <Metric label="Bounced" value={m ? String(m.bounced) : "—"} tint={m && m.bounced > 0 ? tokens.redTint : undefined} color={m && m.bounced > 0 ? tokens.red : undefined} />
        </Box>

        {/* Coming-soon note for the inbox half */}
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", p: 1.25, mb: 2, bgcolor: tokens.primaryBg, border: `1px solid ${tokens.primaryBorder}`, borderRadius: 1 }}>
          <MarkEmailReadOutlinedIcon sx={{ fontSize: 18, color: tokens.primary, mt: "1px" }} />
          <Typography sx={{ fontSize: 12.5, color: tokens.ink2, lineHeight: 1.4 }}>
            Replies and composing as kieran@ / partner@estatekit.co are being set up. This shows every email your automations have sent, with open and bounce rates.
          </Typography>
        </Box>

        {/* List */}
        <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: 1, overflow: "hidden" }}>
          {(emails.isLoading || metrics.isLoading) && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}><CircularProgress size={24} /></Box>
          )}
          {notSetUp && (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <Typography sx={{ fontSize: 14, color: tokens.ink3 }}>Workflows aren't set up on this project yet.</Typography>
            </Box>
          )}
          {!emails.isLoading && !notSetUp && list.length === 0 && (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <Typography sx={{ fontSize: 14, color: tokens.ink3 }}>No workflow emails sent in this window.</Typography>
            </Box>
          )}
          {list.map((e) => <Row key={e.id} e={e} />)}
        </Box>
      </Box>
    </Box>
  );
}
