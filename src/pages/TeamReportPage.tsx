import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Avatar, Box, Button, MenuItem, Skeleton, TextField, Typography, useMediaQuery } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { listAgentProfiles, setActiveAgent } from "../api/_client";
import { getWeeklyReport, weekLabel, type WeeklyReport } from "../api/weeklyReport";
import { useAuth } from "../hooks/useAuth";
import { useIsOperator } from "../hooks/useAutomations";
import { duration, speedVerdict } from "./WeeklyReportPage";
import { tokens } from "../theme";
import InfoTip from "../components/InfoTip";

// A team lead's view of their agents (e.g. Bennie: Naudé and Hendrik): what
// each of them did with their leads, side by side, from the same numbers as
// the weekly report (src/api/weeklyReport.ts). Team leads can read their
// members' leads already (the "Team leads …" policies), so nothing new is
// opened up. Staff can look at any team lead's with /team?lead=<id>.

/** -1 = this week so far; 0 = last week; 1 = the week before… */
const WEEKS = [-1, 0, 1, 2, 3, 4, 5, 6, 7];
const weekName = (n: number) => (n === -1 ? `This week so far (${weekLabel(-1).split(" – ")[0]} – today)` : n === 0 ? `Last week (${weekLabel(0)})` : weekLabel(n));

type Tone = "good" | "ok" | "bad" | "plain";
const toneColor: Record<Tone, string> = { good: tokens.green, ok: tokens.amber, bad: tokens.red, plain: "inherit" };

function Cell({ label, value, sub, tone = "plain", tip }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; tip?: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, color: tokens.ink2, display: "flex", alignItems: "center", gap: 0.25, whiteSpace: "nowrap", height: 22, "& .MuiIconButton-root": { p: 0.25 } }}>
        {label}{tip && <InfoTip>{tip}</InfoTip>}
      </Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25, color: toneColor[tone], fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 12, color: tokens.ink3, whiteSpace: "nowrap" }}>{sub}</Typography>}
    </Box>
  );
}

function AgentRow({ name, avatar, you, d, loading, onOpen }: { name: string; avatar: string | null; you: boolean; d?: WeeklyReport; loading: boolean; onOpen: () => void }) {
  const phone = useMediaQuery("(max-width:700px)");
  const w = d?.thisWeek;
  const calledPct = w && w.leads ? Math.round((w.called / w.leads) * 100) : null;
  const speed = d?.typicalMins ?? null;
  const v = speed !== null ? speedVerdict(speed) : null;
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "10px", p: { xs: 1.5, sm: 2 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.5 }}>
        <Avatar src={avatar ?? undefined} sx={{ width: 36, height: 36, fontSize: 15, fontWeight: 700 }}>{name[0]?.toUpperCase()}</Avatar>
        <Typography sx={{ fontSize: 16, fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>{name}{you && <Box component="span" sx={{ color: tokens.ink3, fontWeight: 500 }}> · You</Box>}</Typography>
        <Button size={phone ? "small" : "medium"} variant="outlined" endIcon={<ArrowForwardRoundedIcon />} onClick={onOpen} sx={{ flex: "none" }}>
          {phone ? "Leads" : you ? "My leads" : `Open ${name.split(/\s+/)[0]}'s leads`}
        </Button>
      </Box>
      {loading || !d || !w ? (
        <Skeleton variant="rounded" height={58} />
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))", md: "repeat(6, minmax(0, 1fr))" }, gap: { xs: 1.5, md: 2 } }}>
          <Cell label="New leads" value={w.leads} />
          <Cell
            label="Called"
            value={w.leads ? `${w.called} of ${w.leads}` : "–"}
            sub={calledPct !== null ? `${calledPct}%` : undefined}
            tone={calledPct === null ? "plain" : calledPct >= 90 ? "good" : calledPct >= 70 ? "ok" : "bad"}
            tip="Of the new leads, how many they called or moved on from New Lead."
          />
          <Cell
            label="How fast they call"
            value={speed !== null ? duration(speed) : "–"}
            sub={v?.word}
            tone={v ? (v.cls === "great" ? "good" : v.cls === "ok" ? "ok" : "bad") : "plain"}
            tip="The usual time from a lead arriving to their first call. Within 5 minutes is great."
          />
          <Cell label="Appointments" value={w.booked} />
          <Cell label="Mandates" value={w.mandates} />
          <Cell
            label="Not called yet"
            value={d.notCalled}
            sub={d.noAnswer ? `${d.noAnswer} didn't answer` : "Right now"}
            tone={d.notCalled > 0 ? "bad" : "good"}
            tip="Leads still on New Lead right now, waiting for their first call."
          />
        </Box>
      )}
    </Box>
  );
}

export default function TeamReportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: isOperator } = useIsOperator();
  // Staff can look at a team lead's page; everyone else sees their own team.
  const leadId = (isOperator && params.get("lead")) || user?.id || "";
  const [weeksBack, setWeeksBack] = useState(-1);
  const { data: profiles = [], isLoading: loadingPeople } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles });
  const lead = profiles.find((p) => p.agent_id === leadId);
  const members = profiles.filter((p) => p.team_lead_id === leadId && !p.deactivated_at);
  const people = [...members, ...(lead ? [lead] : [])];
  const reports = useQueries({
    queries: people.map((p) => ({ queryKey: ["weeklyReport", p.agent_id, weeksBack], queryFn: () => getWeeklyReport(p.agent_id, weeksBack), staleTime: 5 * 60_000 })),
  });
  useEffect(() => { document.title = "My team · EstateKit"; }, []);

  const openLeads = (agentId: string) => {
    setActiveAgent(agentId === user?.id ? null : agentId);
    navigate("/leads");
  };

  const totals = reports.reduce((t, r) => ({ waiting: t.waiting + (r.data?.notCalled ?? 0) }), { waiting: 0 });

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1200, mx: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: { xs: "stretch", sm: "center" }, flexDirection: { xs: "column", sm: "row" }, gap: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{isOperator && lead && lead.agent_id !== user?.id ? `${lead.display_name}'s team` : "My team"}</Typography>
          <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>What each agent did with their leads.{totals.waiting > 0 ? ` ${totals.waiting} lead${totals.waiting === 1 ? " is" : "s are"} still waiting for a first call.` : ""}</Typography>
        </Box>
        <TextField select size="small" label="Week" value={weeksBack} onChange={(e) => setWeeksBack(Number(e.target.value))} sx={{ minWidth: 260 }}>
          {WEEKS.map((n) => <MenuItem key={n} value={n}>{weekName(n)}</MenuItem>)}
        </TextField>
      </Box>

      {!loadingPeople && members.length === 0 && (
        <Typography sx={{ fontSize: 14.5, color: tokens.ink2, bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "10px", p: 2 }}>
          No agents in this team yet. EstateKit adds them for you.
        </Typography>
      )}

      {people.map((p, i) => (
        <AgentRow
          key={p.agent_id}
          name={p.display_name || "Agent"}
          avatar={p.avatar_url ?? p.sidebar_logo_url ?? null}
          you={p.agent_id === user?.id}
          d={reports[i]?.data}
          loading={reports[i]?.isLoading ?? true}
          onOpen={() => openLeads(p.agent_id)}
        />
      ))}

      <Typography sx={{ fontSize: 12.5, color: tokens.ink3 }}>
          Counted from what each agent does in EstateKit: a lead counts as called once they tap Call or move it on from New Lead. Appointments and mandates are leads moved to Booked or Mandate Signed that week. Weeks run Monday to Sunday.
      </Typography>
    </Box>
  );
}
