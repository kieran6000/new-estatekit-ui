import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Toolbar,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { tokens } from "../theme";
import { useOverview, type OverviewComputedRow, type OverviewPeriod } from "../hooks/useOverview";

const PERIODS: OverviewPeriod[] = ["This month", "Last 30 days", "Last 7 days", "Lifetime"];

type ColKey = "date" | "spend" | "leads" | "cpl" | "appts" | "mandates" | "comm";
const COLS: { k: ColKey; label: string; num?: boolean; fmt?: (v: number) => string }[] = [
  { k: "date", label: "Date" },
  { k: "spend", label: "Ad spend", num: true, fmt: (v) => "R" + v.toLocaleString() },
  { k: "leads", label: "Leads", num: true },
  { k: "cpl", label: "Cost / lead", num: true, fmt: (v) => (v ? "R" + v.toFixed(0) : "—") },
  { k: "appts", label: "Appts", num: true },
  { k: "mandates", label: "Mandates", num: true },
  { k: "comm", label: "Commission", num: true, fmt: (v) => (v ? "R" + v.toLocaleString() : "—") },
];

export default function OverviewPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<OverviewPeriod>("Last 30 days");
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [sort, setSort] = useState<{ k: ColKey; dir: 1 | -1 }>({ k: "date", dir: -1 });
  const { data = [] } = useOverview(period);

  const totals = useMemo(() => {
    const t = { date: "TOTAL", spend: 0, leads: 0, appts: 0, mandates: 0, comm: 0, cpl: 0 };
    data.forEach((r) => {
      t.spend += r.spend;
      t.leads += r.leads;
      t.appts += r.appts;
      t.mandates += r.mandates;
      t.comm += r.comm;
    });
    t.cpl = t.leads ? t.spend / t.leads : 0;
    return t;
  }, [data]);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const x = a[sort.k as keyof OverviewComputedRow];
      const y = b[sort.k as keyof OverviewComputedRow];
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [data, sort]);

  function toggleSort(k: ColKey) {
    setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: 1 }));
  }

  const cell = (c: (typeof COLS)[number], row: Record<string, number | string>) => {
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

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: "10px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
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
        <Typography sx={{ ml: "auto", color: "text.disabled", fontSize: 12 }}>Tap a heading to sort</Typography>
      </Box>

      <Box sx={{ overflowX: "auto", bgcolor: "background.paper" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {COLS.map((c) => (
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
            <TableRow sx={{ bgcolor: "#eef1f3" }}>
              {COLS.map((c) => (
                <TableCell key={c.k} align={c.num ? "right" : "left"} sx={{ fontWeight: 500, borderTop: `2px solid ${tokens.divider}`, borderBottom: `2px solid ${tokens.divider}` }}>
                  {cell(c, totals)}
                </TableCell>
              ))}
            </TableRow>
            {sorted.map((r, i) => (
              <TableRow key={r.date} sx={i % 2 === 1 ? { bgcolor: "#f7f9fb" } : undefined}>
                {COLS.map((c) => (
                  <TableCell key={c.k} align={c.num ? "right" : "left"}>
                    {cell(c, r as unknown as Record<string, number | string>)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <Typography variant="caption" sx={{ display: "block", p: "12px 16px", color: "text.disabled" }}>
        The numbers that matter day-to-day. Reached, show-rate, ROI &amp; profit columns are hidden to keep it clean.
      </Typography>
    </Box>
  );
}
