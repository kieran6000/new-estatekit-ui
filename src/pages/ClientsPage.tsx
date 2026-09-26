import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  AppBar,
  Avatar,
  Box,
  IconButton,
  InputAdornment,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import { tokens } from "../theme";
import { clientPicture, cplLabel, getSpend30d, listClients, type ClientCardRow } from "../api/clients";
import { timeAgo } from "../lib/timeAgo";
import SignupRequests from "../components/SignupRequests";

type ColKey = "name" | "agency" | "area" | "leads" | "cpl" | "last";
type Dir = "asc" | "desc";

interface Row {
  c: ClientCardRow;
  name: string;
  agency: string;
  area: string;
  leads: number;
  /** undefined while Meta is still loading; null when it can't be worked out. */
  cpl: number | null | undefined;
  spend: number | null | undefined;
  last: number | null;
}

const COLS: { k: ColKey; label: string; num?: boolean; wideOnly?: boolean; firstDir: Dir }[] = [
  { k: "name", label: "Client", firstDir: "asc" },
  { k: "agency", label: "Agency", wideOnly: true, firstDir: "asc" },
  { k: "area", label: "Area", wideOnly: true, firstDir: "asc" },
  { k: "leads", label: "Leads 30d", num: true, firstDir: "desc" },
  { k: "cpl", label: "CPL 30d", num: true, firstDir: "asc" },
  { k: "last", label: "Last lead", num: true, firstDir: "desc" },
];

function cityOf(area: string): string {
  return (area || "").split(/[,/•|]/)[0].trim();
}

function matches(c: ClientCardRow, q: string): boolean {
  if (!q) return true;
  const hay = [c.display_name, c.company, c.area, c.email, c.whatsapp_number].filter(Boolean).join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** Compare two values; blanks always sink to the bottom whichever way the
 *  column is sorted, so "—" and "never" never crowd the top. */
function cmp(a: string | number | null | undefined, b: string | number | null | undefined, dir: Dir): number {
  const blankA = a === null || a === undefined || a === "";
  const blankB = b === null || b === undefined || b === "";
  if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1;
  const r = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
  return dir === "asc" ? r : -r;
}

function loadSort(): { k: ColKey; dir: Dir } {
  try {
    const s = JSON.parse(localStorage.getItem("estatekit_clients_table_sort") || "null");
    if (s && COLS.some((c) => c.k === s.k) && (s.dir === "asc" || s.dir === "desc")) return s;
  } catch { /* ignore */ }
  return { k: "leads", dir: "desc" };
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const wide = useMediaQuery("(min-width:900px)");
  const { data: clients, isLoading, isError } = useQuery({ queryKey: ["clients"], queryFn: listClients, staleTime: 60_000 });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(loadSort);
  useEffect(() => { try { localStorage.setItem("estatekit_clients_table_sort", JSON.stringify(sort)); } catch { /* ignore */ } }, [sort]);

  // One Meta read per ad account (same cache key as the client page), so CPL
  // is known up front and the column can sort.
  const withAds = (clients ?? []).filter((c) => c.fb_ad_account_id);
  const spendQueries = useQueries({
    queries: withAds.map((c) => ({
      queryKey: ["spend30d", c.fb_ad_account_id],
      queryFn: () => getSpend30d(c.fb_ad_account_id!),
      staleTime: 30 * 60_000,
      retry: false,
    })),
  });
  const spendBy = new Map(withAds.map((c, i) => [c.fb_ad_account_id!, spendQueries[i]]));
  const spendKey = spendQueries.map((q) => `${q.status}:${q.data ?? ""}`).join("|");

  const rows: Row[] = useMemo(() => {
    return (clients ?? []).map((c) => {
      const leads = c.live?.leads_30d ?? 0;
      const q = c.fb_ad_account_id ? spendBy.get(c.fb_ad_account_id) : undefined;
      const spend = !c.fb_ad_account_id ? null : q?.isLoading ? undefined : (q?.data ?? null);
      const cpl = spend === undefined ? undefined : spend && leads ? spend / leads : null;
      return {
        c,
        name: c.display_name || c.whatsapp_number || "",
        agency: c.company || "",
        area: cityOf(c.area),
        leads,
        cpl,
        spend,
        last: c.live?.last_lead_at ? new Date(c.live.last_lead_at).getTime() : null,
      };
    });
    // spendKey stands in for the query results, which are a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, spendKey]);

  const shown = useMemo(() => {
    const list = rows.filter((r) => matches(r.c, search.trim()));
    return list.sort((a, b) => cmp(a[sort.k], b[sort.k], sort.dir) || a.name.localeCompare(b.name));
  }, [rows, search, sort]);

  function onSort(k: ColKey) {
    const col = COLS.find((c) => c.k === k)!;
    setSort((s) => (s.k === k ? { k, dir: s.dir === "asc" ? "desc" : "asc" } : { k, dir: col.firstDir }));
  }

  const cols = COLS.filter((c) => wide || !c.wideOnly);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/leads")}>
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Clients</Typography>
          {clients && <Typography sx={{ ml: 1, fontSize: 14, color: tokens.ink3 }}>{clients.length}</Typography>}
        </Toolbar>
      </AppBar>

      <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, px: 2, py: 1.5 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search name, agency, area, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 20, color: tokens.ink3 }} />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearch("")} aria-label="Clear search">
                    <CloseIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
        />
      </Box>

      <Box sx={{ p: { xs: 0, md: 2 }, maxWidth: 1400, mx: "auto" }}>
        <SignupRequests />
        {isError && (
          <Typography sx={{ color: tokens.ink2, p: 2 }}>
            Couldn't load your clients. Check your connection and refresh the page.
          </Typography>
        )}

        <Box sx={{ bgcolor: "background.paper", border: { md: `1px solid ${tokens.divider}` }, borderRadius: { md: "8px" }, overflow: "hidden" }}>
          <Table size="small" sx={{ "& td, & th": { borderColor: tokens.divider2 } }}>
            <TableHead>
              <TableRow>
                {cols.map((col) => (
                  <TableCell
                    key={col.k}
                    align={col.num ? "right" : "left"}
                    sortDirection={sort.k === col.k ? sort.dir : false}
                    sx={{ fontSize: 12, fontWeight: 600, color: tokens.ink2, whiteSpace: "nowrap", py: 1.25, bgcolor: tokens.surface2 }}
                  >
                    <TableSortLabel active={sort.k === col.k} direction={sort.k === col.k ? sort.dir : col.firstDir} onClick={() => onSort(col.k)}>
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading &&
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {cols.map((col) => (
                      <TableCell key={col.k}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))}
              {shown.map((r) => (
                <TableRow
                  key={r.c.agent_id}
                  hover
                  onClick={() => navigate(`/admin/clients/${r.c.agent_id}`)}
                  sx={{ cursor: "pointer", "& td": { fontSize: 13.5, py: 1 } }}
                >
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                      <Avatar src={clientPicture(r.c)} alt={r.name} sx={{ width: 36, height: 36, fontSize: 15, fontWeight: 600, bgcolor: r.c.sidebar_color || "#111827" }}>
                        {(r.name || "?")[0].toUpperCase()}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{r.name || "Unnamed account"}</Typography>
                        {!wide && (r.agency || r.area) && (
                          <Typography sx={{ fontSize: 12, color: tokens.ink2, lineHeight: 1.3 }}>{[r.agency, r.area].filter(Boolean).join(" · ")}</Typography>
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  {wide && <TableCell sx={{ color: tokens.ink2 }}>{r.agency || "—"}</TableCell>}
                  {wide && <TableCell sx={{ color: tokens.ink2 }}>{r.area || "—"}</TableCell>}
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{r.leads}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {r.cpl === undefined ? <Skeleton width={44} sx={{ ml: "auto" }} /> : cplLabel(r.spend, r.leads)}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap", color: r.last ? tokens.ink : tokens.ink3 }}>
                    {r.c.live?.last_lead_at ? timeAgo(r.c.live.last_lead_at) : "never"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {clients && shown.length === 0 && (
            <Box sx={{ textAlign: "center", py: 6, color: tokens.ink2 }}>
              <Typography sx={{ fontWeight: 500 }}>No clients match</Typography>
              <Typography sx={{ fontSize: 13.5, mt: 0.5 }}>Try a different name, agency or area.</Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
