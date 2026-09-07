import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AppBar,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Skeleton,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { tokens } from "../theme";
import { computeDerived, rangeFor, useOverview, type OverviewComputedRow, type OverviewPeriod } from "../hooks/useOverview";
import { getMyProfile } from "../api/agentProfile";
import ActiveAds from "../components/ActiveAds";

const PERIODS: OverviewPeriod[] = ["This month", "Last 30 days", "Last 7 days", "Lifetime", "Custom"];

type Mode = "simple" | "advanced";
type ColKey = keyof OverviewComputedRow;

const money = (v: number) => "R" + Math.round(v).toLocaleString();
const moneyOrDash = (v: number) => (v ? money(v) : "—");
const pct = (v: number) => (v ? Math.round(v * 100) + "%" : "—");

interface Col {
  k: ColKey;
  label: string;
  num?: boolean;
  fmt?: (v: number) => string;
}

const SIMPLE_COLS: Col[] = [
  { k: "date", label: "Date" },
  { k: "spend", label: "Ad spend", num: true, fmt: money },
  { k: "leads", label: "Leads", num: true },
  { k: "cpl", label: "Cost / lead", num: true, fmt: moneyOrDash },
  { k: "appts", label: "Appts", num: true },
  { k: "mandates", label: "Mandates", num: true },
  { k: "commExpected", label: "Commission", num: true, fmt: moneyOrDash },
];

const ADVANCED_COLS: Col[] = [
  { k: "date", label: "Date" },
  { k: "spend", label: "Ad spend", num: true, fmt: money },
  { k: "leads", label: "Leads", num: true },
  { k: "cpl", label: "Cost / lead", num: true, fmt: moneyOrDash },
  { k: "leadsReached", label: "Leads reached", num: true },
  { k: "costPerReachedLead", label: "Cost / reached lead", num: true, fmt: moneyOrDash },
  { k: "appts", label: "Appts booked", num: true },
  { k: "apptsHeld", label: "Appts held", num: true },
  { k: "costPerAppt", label: "Cost / appt", num: true, fmt: moneyOrDash },
  { k: "mandates", label: "Mandates signed", num: true },
  { k: "apptToMandatePct", label: "Appt → mandate %", num: true, fmt: pct },
  { k: "leadToMandatePct", label: "Lead → mandate %", num: true, fmt: pct },
  { k: "commExpected", label: "Expected commission", num: true, fmt: moneyOrDash },
  { k: "commEarned", label: "Earned commission", num: true, fmt: moneyOrDash },
  { k: "costPerMandate", label: "Cost / mandate", num: true, fmt: moneyOrDash },
  { k: "expectedProfit", label: "Expected profit", num: true, fmt: money },
  { k: "actualProfit", label: "Actual profit", num: true, fmt: money },
  { k: "expectedRoi", label: "Expected ROI", num: true, fmt: pct },
  { k: "actualRoi", label: "Actual ROI", num: true, fmt: pct },
];

export default function OverviewPage() {
  const navigate = useNavigate();
  // Remember the chosen period + custom dates across visits.
  const [period, setPeriod] = useState<OverviewPeriod>(() => {
    try {
      const saved = localStorage.getItem("estatekit_overview_period");
      return (saved && PERIODS.includes(saved as OverviewPeriod) ? saved : "Last 30 days") as OverviewPeriod;
    } catch { return "Last 30 days"; }
  });
  useEffect(() => {
    try { localStorage.setItem("estatekit_overview_period", period); } catch { /* ignore */ }
  }, [period]);
  const [mode, setMode] = useState<Mode>("simple");
  const [tab, setTab] = useState<"numbers" | "ads">("numbers");
  const isNarrow = useMediaQuery("(max-width:899px)");
  // Wide screens show both; narrow screens show whichever tab is selected.
  const showNumbers = !isNarrow || tab === "numbers";
  const showAds = !isNarrow || tab === "ads";
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [sort, setSort] = useState<{ k: ColKey; dir: 1 | -1 }>({ k: "date", dir: -1 });
  const todayStr = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(() => {
    try { return localStorage.getItem('estatekit_overview_from') || new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10); }
    catch { return new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10); }
  });
  const [toDate, setToDate] = useState(() => {
    try { return localStorage.getItem('estatekit_overview_to') || todayStr; } catch { return todayStr; }
  });
  useEffect(() => {
    try {
      localStorage.setItem('estatekit_overview_from', fromDate);
      localStorage.setItem('estatekit_overview_to', toDate);
    } catch { /* ignore */ }
  }, [fromDate, toDate]);
  const { data = [], isLoading } = useOverview(period, { from: fromDate, to: toDate });
  const cols = mode === "simple" ? SIMPLE_COLS : ADVANCED_COLS;
  // Ad KPIs report over exactly the window the table is showing.
  const adRange = rangeFor(period, { from: fromDate, to: toDate });
  // Which client's ads to preview — the currently active/managed agent.
  const { data: profile } = useQuery({ queryKey: ["myProfile"], queryFn: getMyProfile });

  const totals = useMemo(() => {
    const raw = { spend: 0, leads: 0, leadsReached: 0, appts: 0, apptsHeld: 0, mandates: 0, commExpected: 0, commEarned: 0 };
    data.forEach((r) => {
      raw.spend += r.spend;
      raw.leads += r.leads;
      raw.leadsReached += r.leadsReached;
      raw.appts += r.appts;
      raw.apptsHeld += r.apptsHeld;
      raw.mandates += r.mandates;
      raw.commExpected += r.commExpected;
      raw.commEarned += r.commEarned;
    });
    return { date: "TOTAL", ...computeDerived(raw) };
  }, [data]);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const x = a[sort.k];
      const y = b[sort.k];
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [data, sort]);

  function toggleSort(k: ColKey) {
    setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: 1 }));
  }

  const cell = (c: Col, row: Record<string, number | string>) => {
    const v = row[c.k];
    return c.fmt ? c.fmt(v as number) : v;
  };

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/leads")}>
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Overview</Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, p: "10px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Box
          component="button"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "4px", bgcolor: "#fff", fontSize: 13, p: "9px 12px", cursor: "pointer" }}
        >
          {period}
        </Box>
        <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
          {PERIODS.map((p) => (
            <MenuItem
              key={p}
              selected={p === period}
              onClick={() => {
                setPeriod(p);
                setMenuAnchor(null);
              }}
            >
              {p}
            </MenuItem>
          ))}
        </Menu>

        {period === "Custom" && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <TextField
              type="date"
              size="small"
              label="From"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: toDate } }}
            />
            <Typography sx={{ color: "text.disabled", fontSize: 13 }}>→</Typography>
            <TextField
              type="date"
              size="small"
              label="To"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: fromDate, max: todayStr } }}
            />
          </Box>
        )}

        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_e, v) => v && setMode(v)}
          sx={{ "& .MuiToggleButton-root": { textTransform: "none", fontSize: 13, px: 1.5, py: 0.5 } }}
        >
          <ToggleButton value="simple">Simple</ToggleButton>
          <ToggleButton value="advanced">Advanced</ToggleButton>
        </ToggleButtonGroup>

        <Typography sx={{ ml: "auto", color: "text.disabled", fontSize: 12 }}>Tap a heading to sort</Typography>
      </Box>

      {/* On mobile the tabs stop the table being buried under ad previews. On a
          wide screen there's room for both, so the tabs are dropped entirely. */}
      {isNarrow && (
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="fullWidth"
          sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, minHeight: 44 }}
        >
          <Tab label="Numbers" value="numbers" sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }} />
          <Tab label="Active ads" value="ads" sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }} />
        </Tabs>
      )}

      {/* Desktop: table and ads side by side so neither is buried.
          Mobile: whichever tab is selected, full width. */}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: isNarrow ? 0 : 1.5, p: isNarrow ? 0 : "12px 16px" }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
      {showNumbers && (
      <Box sx={{ overflowX: "auto", bgcolor: "background.paper", border: isNarrow ? 0 : `1px solid ${tokens.divider}`, borderRadius: isNarrow ? 0 : "8px" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {cols.map((c) => (
                <TableCell
                  key={c.k}
                  align={c.num ? "right" : "left"}
                  onClick={() => toggleSort(c.k)}
                  sx={{ cursor: "pointer", fontSize: 12, fontWeight: 500, color: "text.secondary", whiteSpace: "nowrap" }}
                >
                  {c.label} {sort.k === c.k ? (sort.dir > 0 ? "▲" : "▼") : ""}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {cols.map((c) => (
                    <TableCell key={c.k}>
                      <Skeleton variant="text" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <>
                <TableRow sx={{ bgcolor: "#eef1f3" }}>
                  {cols.map((c) => (
                    <TableCell key={c.k} align={c.num ? "right" : "left"} sx={{ fontWeight: 500, borderTop: `2px solid ${tokens.divider}`, borderBottom: `2px solid ${tokens.divider}`, whiteSpace: "nowrap" }}>
                      {cell(c, totals as unknown as Record<string, number | string>)}
                    </TableCell>
                  ))}
                </TableRow>
                {sorted.map((r, i) => (
                  <TableRow key={r.date} sx={i % 2 === 1 ? { bgcolor: "#f7f9fb" } : undefined}>
                    {cols.map((c) => (
                      <TableCell key={c.k} align={c.num ? "right" : "left"} sx={{ whiteSpace: "nowrap" }}>
                        {cell(c, r as unknown as Record<string, number | string>)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </Box>
      )}
      {showNumbers && (
        <Typography variant="caption" sx={{ display: "block", p: "12px 16px", color: "text.disabled" }}>
          {mode === "simple"
            ? "The numbers that matter day-to-day. Switch to Advanced for reach, show-rate, ROI & profit."
            : "Everything, including reach, show-rate, expected vs. actual commission, profit and ROI."}
        </Typography>
      )}

      </Box>

      {showAds && (
        <Box
          sx={{
            bgcolor: "background.paper",
            width: isNarrow ? "100%" : 372,
            flex: isNarrow ? "1 1 100%" : "0 0 372px",
            border: isNarrow ? 0 : `1px solid ${tokens.divider}`,
            borderTop: isNarrow ? `1px solid ${tokens.divider}` : undefined,
            borderRadius: isNarrow ? 0 : "8px",
            position: isNarrow ? "static" : "sticky",
            top: isNarrow ? undefined : 72,
            maxHeight: isNarrow ? undefined : "calc(100dvh - 88px)",
            overflowY: isNarrow ? undefined : "auto",
          }}
        >
          {!isNarrow && (
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", p: "14px 16px 0" }}>
              Active ads · {period.toLowerCase()}
            </Typography>
          )}
          <ActiveAds
            adAccountId={profile?.fbAdAccountId || undefined}
            agentName={profile?.company || profile?.displayName}
            since={adRange.from}
            until={adRange.to}
          />
        </Box>
      )}
      </Box>
    </Box>
  );
}
