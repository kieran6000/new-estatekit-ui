import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  AppBar,
  Avatar,
  Box,
  ButtonBase,
  IconButton,
  InputAdornment,
  MenuItem,
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
  getLastActivity,
  getLeadCounts,
  getSpendDaily,
  hasPaymentProblem,
  listClients,
  spendBetween,
  type ClientCardRow,
  type LastActivity,
} from "../api/clients";
import { getFbAdAccount } from "../api/agentProfile";
import { setupProgress, SETUP_TOTAL } from "../lib/setup";
import { resolveRange, useDateRange, ymd } from "../lib/range";
import { timeAgo } from "../lib/timeAgo";
import SignupRequests from "../components/SignupRequests";
import RangePicker from "../components/RangePicker";
import FundingChip from "../components/FundingChip";

type ColKey = "name" | "agency" | "leads" | "spend" | "cpl" | "funding" | "active" | "last" | "setup";
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
  fundingType: string | null;
  fundingLabel: string | null;
  /** Amount due to Facebook right now (Meta's balance). Shown on hover only. */
  owed: number | null;
  accountStatus: number | null;
  /** A real payment problem (hasPaymentProblem), not just normal spend. */
  problem: boolean;
  /** Latest sign of life: app use or a lead update (ms), for sorting. */
  active: number | null;
  activity: LastActivity | null;
  last: number | null;
  /** Get set up: how many of the six are done. */
  setup: number;
}

/** Table columns. Numbers are right-aligned with fixed widths; Account and
 *  Agency share whatever width is left. */
const COLS: { k: ColKey; label: string; num?: boolean; width?: number; firstDir: Dir; tip?: string }[] = [
  { k: "name", label: "Account", firstDir: "asc" },
  { k: "agency", label: "Agency", firstDir: "asc" },
  { k: "leads", label: "Leads", num: true, width: 80, firstDir: "desc" },
  { k: "spend", label: "Ad spend", num: true, width: 110, firstDir: "desc" },
  { k: "cpl", label: "CPL", num: true, width: 90, firstDir: "asc" },
  { k: "funding", label: "Pays by", width: 150, firstDir: "asc" },
  { k: "active", label: "Last active", num: true, width: 115, firstDir: "desc", tip: "Last time they used the app or updated a lead" },
  { k: "last", label: "Last lead", num: true, width: 105, firstDir: "desc" },
  { k: "setup", label: "Set up", num: true, width: 80, firstDir: "asc" },
];

const money = (n: number) => "R" + Math.round(n).toLocaleString("en-ZA");
const WEEK = 7 * 864e5;

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

/** "3h ago", with what they did on hover. Greyed out after a week. */
function ActiveLabel({ a }: { a: LastActivity | null }) {
  if (!a?.lastSeen) return <Typography component="span" sx={{ fontSize: "inherit", color: tokens.ink3 }}>never</Typography>;
  const stale = Date.now() - new Date(a.lastSeen).getTime() > WEEK;
  const tip = [
    a.lastInApp ? `Used the app ${timeAgo(a.lastInApp)}` : "Hasn't used the app",
    a.lastLeadAction ? `Updated a lead ${timeAgo(a.lastLeadAction)}` : "Hasn't updated a lead",
  ].join(" · ");
  return (
    <Tooltip title={tip}>
      <Typography component="span" sx={{ fontSize: "inherit", color: stale ? tokens.ink3 : tokens.ink, cursor: "default" }}>
        {timeAgo(a.lastSeen)}
      </Typography>
    </Tooltip>
  );
}

/** Operators: every account, with leads, ad spend and cost per lead for the
 *  chosen dates, how they pay for ads, their latest sign of life, and a way
 *  into their Ads Manager. A table on a computer, cards on a phone. */
export default function ClientsPage() {
  const navigate = useNavigate();
  const wide = useMediaQuery("(min-width:1000px)");
  const [range, setRange] = useDateRange("estatekit_accounts_range");
  const { since, until, label } = resolveRange(range);
  const sinceDay = ymd(since);
  const untilDay = ymd(until);
  const rangeDays = Math.max(1, Math.round((until.getTime() - since.getTime()) / 864e5));

  const { data: clients, isLoading, isError } = useQuery({ queryKey: ["clients"], queryFn: listClients, staleTime: 60_000 });
  const { data: counts } = useQuery({
    queryKey: ["leadCounts", sinceDay, untilDay],
    queryFn: () => getLeadCounts(since, until),
    staleTime: 60_000,
  });
  const { data: activity } = useQuery({ queryKey: ["lastActivity"], queryFn: getLastActivity, staleTime: 60_000 });
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
      const act = activity?.get(c.agent_id) ?? null;
      return {
        c,
        name: c.display_name || c.whatsapp_number || "",
        agency: c.company || "",
        area: cityOf(c.area),
        leads,
        spend,
        cpl,
        funding: !acct ? null : fq?.isLoading ? undefined : fundingKind(fq?.data?.fundingType),
        fundingType: fq?.data?.fundingType ?? null,
        fundingLabel: fq?.data?.fundingLabel ?? null,
        owed: fq?.data?.balance ?? null,
        accountStatus: fq?.data?.accountStatus ?? null,
        problem: hasPaymentProblem(fq?.data, spend != null ? spend / rangeDays : null),
        active: act?.lastSeen ? new Date(act.lastSeen).getTime() : null,
        activity: act,
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
  }, [clients, counts, activity, metaKey, sinceDay, untilDay, rangeDays]);

  const shown = useMemo(() => {
    const list = rows.filter((r) => matches(r.c, search.trim()));
    // "Pays by": accounts with a payment problem first.
    const key = (r: Row) => (sort.k === "funding" ? (r.funding ? (r.problem ? "0" : "1") + r.funding : null) : r[sort.k]);
    return list.sort((a, b) => cmp(key(a) as string | number | null | undefined, key(b) as string | number | null | undefined, sort.dir) || a.name.localeCompare(b.name));
  }, [rows, search, sort]);

  // Totals for the range (spend only once every account's figure is in).
  const totals = useMemo(() => {
    const leads = rows.reduce((a, r) => a + r.leads, 0);
    const loading = rows.some((r) => r.spend === undefined);
    const spend = rows.reduce((a, r) => a + (r.spend || 0), 0);
    return { leads, spend, loading, active: rows.filter((r) => r.leads > 0).length, problems: rows.filter((r) => r.problem).length };
  }, [rows]);

  function onSort(k: ColKey) {
    const col = COLS.find((c) => c.k === k)!;
    setSort((s) => (s.k === k ? { k, dir: s.dir === "asc" ? "desc" : "asc" } : { k, dir: col.firstDir }));
  }

  const spendCell = (r: Row) => (r.spend === undefined ? <Skeleton width={50} sx={{ ml: "auto" }} /> : r.spend == null ? "—" : money(r.spend));
  const cplCell = (r: Row) => (r.cpl === undefined ? <Skeleton width={44} sx={{ ml: "auto" }} /> : cplLabel(r.spend, r.leads));
  const setupCell = (r: Row) => (r.setup === SETUP_TOTAL ? "Done" : `${r.setup}/${SETUP_TOTAL}`);
  const adsLink = (r: Row) =>
    r.c.fb_ad_account_id ? (
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
    ) : null;
  const avatar = (r: Row, size: number) => (
    <Avatar src={clientPicture(r.c)} alt={r.name} sx={{ width: size, height: size, fontSize: size * 0.42, fontWeight: 600, bgcolor: r.c.sidebar_color || "#111827", flexShrink: 0 }}>
      {(r.name || "?")[0].toUpperCase()}
    </Avatar>
  );
  const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

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
          sx={{ flex: 1, minWidth: 200 }}
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

      <Box sx={{ p: { xs: 1.5, md: 2 }, display: "flex", flexDirection: "column", gap: 2 }}>
        <SignupRequests />

        {/* Totals for the chosen dates. */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(5, minmax(0, 1fr))" }, gap: 1.5 }}>
          <Kpi label={`Leads · ${label}`} value={counts ? totals.leads.toLocaleString("en-ZA") : <Skeleton width={60} />} />
          <Kpi label={`Ad spend · ${label}`} value={totals.loading ? <Skeleton width={80} /> : money(totals.spend)} />
          <Kpi label="Cost per lead" value={totals.loading ? <Skeleton width={60} /> : cplLabel(totals.spend, totals.leads)} />
          <Kpi label="Accounts with leads" value={counts ? `${totals.active} of ${rows.length}` : <Skeleton width={60} />} />
          <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}>
            <Kpi
              label="Payment problems"
              value={totals.loading ? <Skeleton width={60} /> : totals.problems ? `${totals.problems} ${totals.problems === 1 ? "account" : "accounts"}` : "None"}
              warn={totals.problems > 0}
            />
          </Box>
        </Box>

        {isError && (
          <Typography sx={{ color: tokens.ink2, p: 2 }}>
            Couldn't load the accounts. Check your connection and refresh the page.
          </Typography>
        )}

        {wide ? (
          /* ── computer: table ── */
          <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden" }}>
            <Table size="small" sx={{ tableLayout: "fixed", "& td, & th": { borderColor: tokens.divider2, px: 1.5 } }}>
              <colgroup>
                {COLS.map((col) => <col key={col.k} style={col.width ? { width: col.width } : undefined} />)}
                <col style={{ width: 52 }} />
              </colgroup>
              <TableHead>
                <TableRow>
                  {COLS.map((col) => (
                    <TableCell
                      key={col.k}
                      align={col.num ? "right" : "left"}
                      sortDirection={sort.k === col.k ? sort.dir : false}
                      sx={{ fontSize: 12, fontWeight: 600, color: tokens.ink2, whiteSpace: "nowrap", py: 1.25, bgcolor: tokens.surface2 }}
                    >
                      <Tooltip title={col.tip || ""} disableHoverListener={!col.tip}>
                        <TableSortLabel
                          active={sort.k === col.k}
                          direction={sort.k === col.k ? sort.dir : col.firstDir}
                          onClick={() => onSort(col.k)}
                          // Arrow on the left for right-aligned numbers, so the label lines up with the values.
                          sx={col.num ? { flexDirection: "row-reverse" } : undefined}
                        >
                          {col.label}
                        </TableSortLabel>
                      </Tooltip>
                    </TableCell>
                  ))}
                  <TableCell sx={{ bgcolor: tokens.surface2 }} aria-label="Ads Manager" />
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      {COLS.map((col) => <TableCell key={col.k}><Skeleton /></TableCell>)}
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
                        {avatar(r, 36)}
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, ...ellipsis }}>{r.name || "Unnamed account"}</Typography>
                          <Typography sx={{ fontSize: 12, color: tokens.ink2, lineHeight: 1.3, ...ellipsis }}>{r.area || "—"}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ color: tokens.ink2, ...ellipsis }} title={r.agency}>{r.agency || "—"}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {counts ? r.leads : <Skeleton width={30} sx={{ ml: "auto" }} />}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{spendCell(r)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{cplCell(r)}</TableCell>
                    <TableCell sx={ellipsis}>
                      {r.funding === undefined ? (
                        <Skeleton width={70} />
                      ) : r.funding ? (
                        <FundingChip type={r.fundingType} label={r.fundingLabel} balance={r.owed} problem={r.problem} status={r.accountStatus} showLabel />
                      ) : (
                        <Typography component="span" sx={{ fontSize: 13, color: tokens.ink3 }}>—</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}><ActiveLabel a={r.activity} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap", color: r.last ? tokens.ink : tokens.ink3 }}>
                      {r.c.live?.last_lead_at ? timeAgo(r.c.live.last_lead_at) : "never"}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: r.setup === SETUP_TOTAL ? "success.main" : tokens.ink }}>
                      {setupCell(r)}
                    </TableCell>
                    <TableCell align="center" sx={{ py: "2px !important" }}>{adsLink(r)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {clients && shown.length === 0 && <NoMatches />}
          </Box>
        ) : (
          /* ── phone: one card per account ── */
          <>
            <TextField
              select
              size="small"
              label="Sort by"
              value={`${sort.k}:${sort.dir}`}
              onChange={(e) => {
                const [k, dir] = e.target.value.split(":") as [ColKey, Dir];
                setSort({ k, dir });
              }}
            >
              <MenuItem value="leads:desc">Most leads</MenuItem>
              <MenuItem value="spend:desc">Most ad spend</MenuItem>
              <MenuItem value="cpl:asc">Lowest cost per lead</MenuItem>
              <MenuItem value="active:desc">Most recently active</MenuItem>
              <MenuItem value="last:desc">Latest lead</MenuItem>
              <MenuItem value="funding:asc">Payment problems first</MenuItem>
              <MenuItem value="setup:asc">Least set up</MenuItem>
              <MenuItem value="name:asc">Name (A–Z)</MenuItem>
            </TextField>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="rounded" height={128} />)}
              {shown.map((r) => (
                <ButtonBase
                  key={r.c.agent_id}
                  component="div"
                  role="link"
                  onClick={() => navigate(`/admin/clients/${r.c.agent_id}`)}
                  sx={{ display: "block", textAlign: "left", width: "100%", bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", p: 1.5 }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                    {avatar(r, 40)}
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, ...ellipsis }}>{r.name || "Unnamed account"}</Typography>
                      <Typography sx={{ fontSize: 12.5, color: tokens.ink2, lineHeight: 1.3, ...ellipsis }}>
                        {[r.area, r.agency].filter(Boolean).join(" · ") || "—"}
                      </Typography>
                    </Box>
                    {adsLink(r)}
                  </Box>
                  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1, mt: 1.25 }}>
                    <MiniStat label="Leads" value={counts ? r.leads : <Skeleton width={24} />} />
                    <MiniStat label="Ad spend" value={spendCell(r)} />
                    <MiniStat label="Cost per lead" value={cplCell(r)} />
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mt: 1.25, fontSize: 12.5, color: tokens.ink2 }}>
                    {r.funding && <FundingChip type={r.fundingType} label={r.fundingLabel} balance={r.owed} problem={r.problem} status={r.accountStatus} showLabel />}
                    <span>Active <ActiveLabel a={r.activity} /></span>
                    <span>Last lead {r.c.live?.last_lead_at ? timeAgo(r.c.live.last_lead_at) : "never"}</span>
                    <Box component="span" sx={{ color: r.setup === SETUP_TOTAL ? "success.main" : undefined }}>Set up {setupCell(r)}</Box>
                  </Box>
                </ButtonBase>
              ))}
            </Box>
            {clients && shown.length === 0 && <NoMatches />}
          </>
        )}
      </Box>
    </Box>
  );
}

function NoMatches() {
  return (
    <Box sx={{ textAlign: "center", py: 6, color: tokens.ink2 }}>
      <Typography sx={{ fontWeight: 500 }}>No accounts match</Typography>
      <Typography sx={{ fontSize: 13.5, mt: 0.5 }}>Try a different name, agency or area.</Typography>
    </Box>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="div" sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
      <Typography sx={{ fontSize: 11.5, color: tokens.ink2 }}>{label}</Typography>
    </Box>
  );
}

function Kpi({ label, value, warn }: { label: string; value: ReactNode; warn?: boolean }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${warn ? "#ed6c02" : tokens.divider}`, borderRadius: "8px", px: 2, py: 1.5, minWidth: 0, height: "100%" }}>
      <Typography component="div" sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums", color: warn ? "warning.dark" : undefined }}>{value}</Typography>
      <Typography sx={{ fontSize: 12.5, color: tokens.ink2, mt: 0.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</Typography>
    </Box>
  );
}
