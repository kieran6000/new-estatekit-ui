import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  AppBar,
  Avatar,
  Box,
  Chip,
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
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { tokens } from "../theme";
import {
  adsManagerUrl,
  clientPicture,
  cplLabel,
  fundingKind,
  getLeadCounts,
  getSpendDaily,
  listClients,
  spendBetween,
  type ClientCardRow,
} from "../api/clients";
import { getFbAdAccount } from "../api/agentProfile";
import { setupProgress, SETUP_TOTAL } from "../lib/setup";
import { resolveRange, useDateRange, ymd } from "../lib/range";
import { timeAgo } from "../lib/timeAgo";
import SignupRequests from "../components/SignupRequests";
import RangePicker from "../components/RangePicker";

type ColKey = "name" | "agency" | "leads" | "spend" | "cpl" | "funding" | "last" | "setup";
type Dir = "asc" | "desc";

interface Row {
  c: ClientCardRow;
  name: string;
  agency: string;
  area: string;
  leads: number;
  /** undefined while Meta is still loading; null when there's no ad account or Meta can't be read. */
  spend: number | null | undefined;
  cpl: number | null | undefined;
  funding: string | null | undefined;
  fundingLabel: string | null;
  last: number | null;
  /** Get set up: how many of the six are done. */
  setup: number;
}

const COLS: { k: ColKey; label: string; num?: boolean; wideOnly?: boolean; firstDir: Dir }[] = [
  { k: "name", label: "Account", firstDir: "asc" },
  { k: "agency", label: "Agency", wideOnly: true, firstDir: "asc" },
  { k: "leads", label: "Leads", num: true, firstDir: "desc" },
  { k: "spend", label: "Ad spend", num: true, firstDir: "desc" },
  { k: "cpl", label: "CPL", num: true, firstDir: "asc" },
  { k: "funding", label: "Pays by", wideOnly: true, firstDir: "asc" },
  { k: "last", label: "Last lead", num: true, wideOnly: true, firstDir: "desc" },
  { k: "setup", label: "Set up", num: true, wideOnly: true, firstDir: "asc" },
];

const money = (n: number) => "R" + Math.round(n).toLocaleString("en-ZA");

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
    const s = JSON.parse(localStorage.getItem("estatekit_accounts_table_sort") || "null");
    if (s && COLS.some((c) => c.k === s.k) && (s.dir === "asc" || s.dir === "desc")) return s;
  } catch { /* ignore */ }
  return { k: "leads", dir: "desc" };
}

/** Operators: every account, with leads, ad spend and cost per lead for the
 *  chosen dates, how they pay for ads, and a way into their Ads Manager. */
export default function ClientsPage() {
  const navigate = useNavigate();
  const wide = useMediaQuery("(min-width:900px)");
  const [range, setRange] = useDateRange("estatekit_accounts_range");
  const { since, until, label } = resolveRange(range);
  const sinceDay = ymd(since);
  const untilDay = ymd(until);

  const { data: clients, isLoading, isError } = useQuery({ queryKey: ["clients"], queryFn: listClients, staleTime: 60_000 });
  const { data: counts } = useQuery({
    queryKey: ["leadCounts", sinceDay, untilDay],
    queryFn: () => getLeadCounts(since, until),
    staleTime: 60_000,
  });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(loadSort);
  useEffect(() => { try { localStorage.setItem("estatekit_accounts_table_sort", JSON.stringify(sort)); } catch { /* ignore */ } }, [sort]);

  // One Meta read per ad account for spend (from the range's first day), and
  // one for how it pays. Both cached, so moving between ranges stays light.
  const withAds = (clients ?? []).filter((c) => c.fb_ad_account_id);
  const spendQueries = useQueries({
    queries: withAds.map((c) => ({
      queryKey: ["spendDaily", c.fb_ad_account_id, sinceDay],
      queryFn: () => getSpendDaily(c.fb_ad_account_id!, sinceDay),
      staleTime: 30 * 60_000,
      retry: false,
    })),
  });
  const fundingQueries = useQueries({
    queries: withAds.map((c) => ({
      queryKey: ["fbAdAccount", c.fb_ad_account_id],
      queryFn: () => getFbAdAccount(c.fb_ad_account_id!),
      staleTime: 60 * 60_000,
      retry: false,
    })),
  });
  const spendBy = new Map(withAds.map((c, i) => [c.fb_ad_account_id!, spendQueries[i]]));
  const fundingBy = new Map(withAds.map((c, i) => [c.fb_ad_account_id!, fundingQueries[i]]));
  const metaKey = [...spendQueries, ...fundingQueries].map((q) => `${q.status}:${q.dataUpdatedAt}`).join("|");

  const rows: Row[] = useMemo(() => {
    return (clients ?? []).map((c) => {
      const leads = counts?.get(c.agent_id) ?? 0;
      const acct = c.fb_ad_account_id;
      const sq = acct ? spendBy.get(acct) : undefined;
      const fq = acct ? fundingBy.get(acct) : undefined;
      const spend = !acct ? null : sq?.isLoading ? undefined : spendBetween(sq?.data ?? null, sinceDay, untilDay);
      const cpl = spend === undefined ? undefined : spend && leads ? spend / leads : null;
      return {
        c,
        name: c.display_name || c.whatsapp_number || "",
        agency: c.company || "",
        area: cityOf(c.area),
        leads,
        spend,
        cpl,
        funding: !acct ? null : fq?.isLoading ? undefined : fundingKind(fq?.data?.fundingType),
        fundingLabel: fq?.data?.fundingLabel ?? null,
        last: c.live?.last_lead_at ? new Date(c.live.last_lead_at).getTime() : null,
        setup: setupProgress({
          displayName: c.display_name,
          company: c.company,
          whatsappNumber: c.whatsapp_number,
          email: c.email,
          avatarUrl: c.avatar_url,
          salesCount: c.sales_count,
        }).done,
      };
    });
    // metaKey stands in for the Meta query results, which are new arrays each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, counts, metaKey, sinceDay, untilDay]);

  const shown = useMemo(() => {
    const list = rows.filter((r) => matches(r.c, search.trim()));
    return list.sort((a, b) => cmp(a[sort.k], b[sort.k], sort.dir) || a.name.localeCompare(b.name));
  }, [rows, search, sort]);

  // Totals for the range (spend only once every account's figure is in).
  const totals = useMemo(() => {
    const leads = rows.reduce((a, r) => a + r.leads, 0);
    const loading = rows.some((r) => r.spend === undefined);
    const spend = rows.reduce((a, r) => a + (r.spend || 0), 0);
    return { leads, spend, loading, active: rows.filter((r) => r.leads > 0).length };
  }, [rows]);

  function onSort(k: ColKey) {
    const col = COLS.find((c) => c.k === k)!;
    setSort((s) => (s.k === k ? { k, dir: s.dir === "asc" ? "desc" : "asc" } : { k, dir: col.firstDir }));
  }

  const cols = COLS.filter((c) => wide || !c.wideOnly);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/leads")} aria-label="Back">
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Accounts</Typography>
          {clients && <Typography sx={{ ml: 1, fontSize: 14, color: tokens.ink3 }}>{clients.length}</Typography>}
        </Toolbar>
      </AppBar>

      <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, px: 2, py: 1.5, display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          placeholder="Search name, agency, area, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: 220 }}
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
        <RangePicker value={range} onChange={setRange} />
      </Box>

      <Box sx={{ p: { xs: 1.5, md: 2 }, maxWidth: 1400, mx: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        <SignupRequests />

        {/* Totals for the chosen dates. */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
          <Kpi label={`Leads · ${label}`} value={counts ? totals.leads.toLocaleString("en-ZA") : <Skeleton width={60} />} />
          <Kpi label={`Ad spend · ${label}`} value={totals.loading ? <Skeleton width={80} /> : money(totals.spend)} />
          <Kpi label="Cost per lead" value={totals.loading ? <Skeleton width={60} /> : cplLabel(totals.spend, totals.leads)} />
          <Kpi label="Accounts with leads" value={counts ? `${totals.active} of ${rows.length}` : <Skeleton width={60} />} />
        </Box>

        {isError && (
          <Typography sx={{ color: tokens.ink2, p: 2 }}>
            Couldn't load the accounts. Check your connection and refresh the page.
          </Typography>
        )}

        <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden" }}>
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
                <TableCell sx={{ bgcolor: tokens.surface2, width: 48 }} aria-label="Ads Manager" />
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading &&
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {cols.map((col) => (
                      <TableCell key={col.k}><Skeleton /></TableCell>
                    ))}
                    <TableCell />
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
                        <Typography sx={{ fontSize: 12, color: tokens.ink2, lineHeight: 1.3 }}>
                          {wide ? r.area : [r.agency, r.area].filter(Boolean).join(" · ")}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  {wide && <TableCell sx={{ color: tokens.ink2 }}>{r.agency || "—"}</TableCell>}
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {counts ? r.leads : <Skeleton width={30} sx={{ ml: "auto" }} />}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {r.spend === undefined ? <Skeleton width={50} sx={{ ml: "auto" }} /> : r.spend == null ? "—" : money(r.spend)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {r.cpl === undefined ? <Skeleton width={44} sx={{ ml: "auto" }} /> : cplLabel(r.spend, r.leads)}
                  </TableCell>
                  {wide && (
                    <TableCell>
                      {r.funding === undefined ? (
                        <Skeleton width={60} />
                      ) : r.funding ? (
                        <Tooltip title={r.fundingLabel || ""} disableHoverListener={!r.fundingLabel}>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={r.funding === "Prepaid" ? "Prepaid funds" : r.funding}
                            color={r.funding === "Prepaid" ? "primary" : "default"}
                            sx={{ height: 22, fontSize: 12 }}
                          />
                        </Tooltip>
                      ) : (
                        <Typography component="span" sx={{ fontSize: 13, color: tokens.ink3 }}>—</Typography>
                      )}
                    </TableCell>
                  )}
                  {wide && (
                    <TableCell align="right" sx={{ whiteSpace: "nowrap", color: r.last ? tokens.ink : tokens.ink3 }}>
                      {r.c.live?.last_lead_at ? timeAgo(r.c.live.last_lead_at) : "never"}
                    </TableCell>
                  )}
                  {wide && (
                    <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: r.setup === SETUP_TOTAL ? "success.main" : tokens.ink }}>
                      {r.setup === SETUP_TOTAL ? "Done" : `${r.setup}/${SETUP_TOTAL}`}
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ py: "2px !important" }}>
                    {r.c.fb_ad_account_id && (
                      <Tooltip title="Open Ads Manager">
                        <IconButton
                          size="small"
                          component="a"
                          href={adsManagerUrl(r.c.fb_ad_account_id)}
                          target="_blank"
                          rel="noopener"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Open ${r.name}'s Ads Manager`}
                        >
                          <OpenInNewIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {clients && shown.length === 0 && (
            <Box sx={{ textAlign: "center", py: 6, color: tokens.ink2 }}>
              <Typography sx={{ fontWeight: 500 }}>No accounts match</Typography>
              <Typography sx={{ fontSize: 13.5, mt: 0.5 }}>Try a different name, agency or area.</Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", px: 2, py: 1.5 }}>
      <Typography component="div" sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
      <Typography sx={{ fontSize: 12.5, color: tokens.ink2, mt: 0.25 }}>{label}</Typography>
    </Box>
  );
}
