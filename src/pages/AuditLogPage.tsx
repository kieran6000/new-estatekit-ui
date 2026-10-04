import { Fragment, useMemo, useState } from "react";
import {
  AppBar,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  MenuItem,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DownloadIcon from "@mui/icons-material/Download";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import LoginIcon from "@mui/icons-material/Login";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import CallIcon from "@mui/icons-material/Call";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import BoltIcon from "@mui/icons-material/Bolt";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlined";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import EditNoteIcon from "@mui/icons-material/EditNote";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import KeyIcon from "@mui/icons-material/Key";
import BlockIcon from "@mui/icons-material/Block";
import TuneIcon from "@mui/icons-material/Tune";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import PauseCircleOutlinedIcon from "@mui/icons-material/PauseCircleOutlined";
import PlayCircleOutlinedIcon from "@mui/icons-material/PlayCircleOutlined";
import LinkIcon from "@mui/icons-material/Link";
import WebIcon from "@mui/icons-material/Web";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { tokens } from "../theme";
import { PlainHead, SortHead, sortRows, useTableSort } from "../components/SortHead";

const ACTIVITY_KEYS = ["when", "who", "account", "what", "device"] as const;
type ActivityKey = (typeof ACTIVITY_KEYS)[number];
const USER_KEYS = ["name", "contact", "company", "seen", "leads", "status"] as const;
type UserKey = (typeof USER_KEYS)[number];
import { timeAgo } from "../lib/timeAgo";
import { getAuditData, type AuditCategory, type AuditEvent, type AuditUser } from "../api/audit";

// Audit log: who did what, to which account, and when. Operators only.
// Real data from src/api/audit.ts: lead history, the audit_log table
// (sign-ins, setup, ads, automation switches, access) and profiles.

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  login: "Sign-ins",
  leads: "Leads",
  setup: "Setup changes",
  ads: "Ads",
  automations: "Automations & emails",
  account: "Users & access",
};

const CATEGORY_ICON: Record<AuditCategory, { icon: React.ReactNode; color: string }> = {
  login: { icon: <LoginIcon />, color: tokens.primary },
  leads: { icon: <PersonOutlineIcon />, color: tokens.green },
  automations: { icon: <BoltIcon />, color: tokens.orange },
  setup: { icon: <TuneIcon />, color: tokens.purple },
  ads: { icon: <CampaignOutlinedIcon />, color: tokens.teal },
  account: { icon: <KeyIcon />, color: tokens.red },
};

/** A specific icon per action where one fits; otherwise its category's. */
const ACTION_ICON: [RegExp, typeof LoginIcon][] = [
  [/signed in/i, LoginIcon],
  [/signed out/i, LogoutIcon],
  [/^Switched account/, SwapHorizIcon],
  [/password/i, KeyIcon],
  [/emergency stop/i, BlockIcon],
  [/ad back on/, PlayCircleOutlinedIcon],
  [/^Paused an ad/, PauseCircleOutlinedIcon],
  [/WhatsApp number/, WhatsAppIcon],
  [/page link/i, LinkIcon],
  [/lead page|recent sale/i, WebIcon],
  [/^New lead/, PersonAddAltIcon],
  [/another pipeline/, DriveFileMoveOutlinedIcon],
  [/^Moved lead/, SwapHorizIcon],
  [/^Called/, CallIcon],
  [/note/i, EditNoteIcon],
  [/^Archived/, ArchiveOutlinedIcon],
  [/^Restored/, UnarchiveOutlinedIcon],
  [/WhatsApp/i, WhatsAppIcon],
  [/Marketing Plan/, DescriptionOutlinedIcon],
  [/failed|bounced|spam/i, ErrorOutlineIcon],
  [/email/i, EmailOutlinedIcon],
];

function ActionIcon({ e }: { e: { action: string; category: AuditCategory } }) {
  const c = CATEGORY_ICON[e.category];
  const Icon = ACTION_ICON.find(([re]) => re.test(e.action))?.[1];
  return (
    <Box sx={{ width: 30, height: 30, borderRadius: "8px", flex: "none", display: "grid", placeItems: "center", bgcolor: `color-mix(in srgb, ${c.color} 10%, transparent)`, color: c.color, "& svg": { fontSize: 17 } }}>
      {Icon ? <Icon /> : c.icon}
    </Box>
  );
}

const COUNTRY_NAME: Record<string, string> = { ZA: "South Africa", GB: "United Kingdom", US: "United States", NA: "Namibia", BW: "Botswana", ZW: "Zimbabwe", MZ: "Mozambique", AE: "United Arab Emirates", AU: "Australia", NL: "Netherlands", DE: "Germany", IE: "Ireland" };

/** A flag image (Windows doesn't draw flag emoji), with the country as text for screen readers. */
function Flag({ code }: { code?: string }) {
  const [failed, setFailed] = useState(false);
  if (!code || !/^[A-Z]{2}$/.test(code)) return null;
  const name = COUNTRY_NAME[code] ?? code;
  if (failed) return <Box component="span" title={name} sx={{ fontSize: 10.5, fontWeight: 700, px: 0.5, borderRadius: "2px", bgcolor: tokens.surface2, color: "text.secondary" }}>{code}</Box>;
  return (
    <Box
      component="img"
      src={`https://flagcdn.com/20x15/${code.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/40x30/${code.toLowerCase()}.png 2x`}
      width={20}
      height={15}
      alt={name}
      title={name}
      loading="lazy"
      onError={() => setFailed(true)}
      sx={{ borderRadius: "2px", boxShadow: `0 0 0 1px ${tokens.divider}`, flex: "none", verticalAlign: "-2px" }}
    />
  );
}

const RANGES = [
  { v: "1", label: "Last 24 hours" },
  { v: "7", label: "Last 7 days" },
  { v: "30", label: "Last 30 days" },
  { v: "90", label: "Last 90 days" },
];

const fullDate = (iso: string) =>
  new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function initials(name: string) {
  return name.replace(/\(.*?\)/g, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function toCsv(rows: string[][]): string {
  // A leading = + - @ would run as a formula when opened in Excel or Sheets.
  const cell = (c: string) => `"${(/^[=+\-@]/.test(c ?? "") ? "'" : "") + (c ?? "").replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The window the query starts from, rounded to the minute so it caches. */
function sinceFor(range: string) {
  const ms = Number(range) * 86_400_000;
  return new Date(Math.floor((Date.now() - ms) / 60_000) * 60_000).toISOString();
}

export default function AuditLogPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"activity" | "users">("activity");
  const [selected, setSelected] = useState<AuditUser[]>([]);
  const [range, setRange] = useState("7");
  const [since] = useState(() => ({ "1": sinceFor("1"), "7": sinceFor("7"), "30": sinceFor("30"), "90": sinceFor("90") }));
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["auditLog", range],
    queryFn: () => getAuditData(since[range as keyof typeof since]),
    staleTime: 60_000,
  });

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/account")} aria-label="Back to account">
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500, flex: 1 }}>Audit log</Typography>
          <Button size="small" onClick={() => refetch()} disabled={isFetching} sx={{ color: "inherit" }}>
            {isFetching ? "Loading…" : "Refresh"}
          </Button>
        </Toolbar>
      </AppBar>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, minHeight: 44, px: 1 }}
      >
        <Tab label="Activity" value="activity" sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }} />
        <Tab label={`Users${data ? ` (${data.users.length})` : ""}`} value="users" sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }} />
      </Tabs>
      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}><CircularProgress /></Box>
      ) : isError || !data ? (
        <Box sx={{ p: 4, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 500 }}>Couldn't load the audit log.</Typography>
          <Button onClick={() => refetch()} sx={{ mt: 1 }}>Try again</Button>
        </Box>
      ) : tab === "activity" ? (
        <ActivityTab users={data.users} events={data.events} capped={data.capped} selected={selected} setSelected={setSelected} range={range} setRange={setRange} />
      ) : (
        <UsersTab users={data.users} onShowActivity={(u) => { setSelected([u]); setTab("activity"); }} />
      )}
    </Box>
  );
}

function ActivityTab({ users, events, capped, selected, setSelected, range, setRange }: {
  users: AuditUser[]; events: AuditEvent[]; capped: boolean;
  selected: AuditUser[]; setSelected: (u: AuditUser[]) => void;
  range: string; setRange: (r: string) => void;
}) {
  const isDesktop = useMediaQuery("(min-width:900px)");
  const [categories, setCategories] = useState<AuditCategory[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const who = (e: AuditEvent) => (e.actorId ? byId.get(e.actorId)?.name ?? "Unknown user" : e.actorLabel);

  const rows = useMemo(() => {
    const ids = new Set(selected.map((u) => u.id));
    const needle = q.trim().toLowerCase();
    return events.filter((e) => {
      // A selected user matches what they did and what happened in their account.
      if (ids.size && !(e.actorId && ids.has(e.actorId)) && !(e.accountId && ids.has(e.accountId))) return false;
      if (categories.length && !categories.includes(e.category)) return false;
      if (needle) {
        const hay = [e.action, e.target, e.before, e.after, e.device, e.via, e.location, e.ip, who(e), e.accountId ? byId.get(e.accountId)?.name : ""].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, selected, categories, q, byId]);

  const { sort, onSort } = useTableSort<ActivityKey>("estatekit_audit_activity_sort", { k: "when", dir: "desc" }, ACTIVITY_KEYS);
  const shown = useMemo(() => {
    const get = (e: AuditEvent): string | number | null =>
      sort.k === "when" ? e.at : sort.k === "who" ? who(e) : sort.k === "account" ? (e.accountId ? byId.get(e.accountId)?.name ?? "" : "") : sort.k === "what" ? e.action : e.device;
    return sortRows(rows, get, sort.dir).slice(0, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, byId]);

  function exportCsv() {
    download(
      "estatekit-audit-log.csv",
      toCsv([
        ["When", "Who", "Account", "Category", "Action", "Lead / details", "Before", "After", "Via", "Device", "Location", "IP"],
        ...rows.map((e) => [fullDate(e.at), who(e), e.accountId ? byId.get(e.accountId)?.name ?? "" : "", CATEGORY_LABEL[e.category], e.action, e.target ?? "", e.before ?? "", e.after ?? "", e.via, e.device, e.location ?? "", e.ip ?? ""]),
      ]),
    );
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto", p: 2, pb: 6 }}>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: isDesktop ? "2fr 1fr 1.4fr" : "1fr", mb: 1.5 }}>
        <Autocomplete
          multiple
          size="small"
          options={users}
          value={selected}
          onChange={(_, v) => setSelected(v)}
          getOptionLabel={(u) => u.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(p) => <TextField {...p} label="Users" placeholder={selected.length ? "" : "All users"} />}
        />
        <TextField select size="small" label="When" value={range} onChange={(e) => setRange(e.target.value)}>
          {RANGES.map((r) => <MenuItem key={r.v} value={r.v}>{r.label}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Search" placeholder="Lead, change, device, place…" value={q} onChange={(e) => setQ(e.target.value)} />
      </Box>
      <Box sx={{ display: "flex", gap: 0.75, flexWrap: { xs: "nowrap", md: "wrap" }, overflowX: { xs: "auto", md: "visible" }, mx: { xs: -2, md: 0 }, px: { xs: 2, md: 0 }, pb: 0.5, mb: 1, scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
        {(Object.keys(CATEGORY_LABEL) as AuditCategory[]).map((c) => {
          const on = categories.includes(c);
          return (
            <Chip
              key={c}
              label={CATEGORY_LABEL[c]}
              color={on ? "primary" : "default"}
              variant={on ? "filled" : "outlined"}
              onClick={() => setCategories(on ? categories.filter((x) => x !== c) : [...categories, c])}
              sx={{ flex: "none" }}
            />
          );
        })}
      </Box>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
        <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13, color: "text.secondary" }}>
          {rows.length.toLocaleString()} event{rows.length === 1 ? "" : "s"}{rows.length > shown.length ? ` · showing the latest ${shown.length}` : ""}
        </Typography>
        <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={exportCsv} disabled={!rows.length} sx={{ flex: "none" }}>
          Export CSV
        </Button>
      </Box>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 2 }}>
        Sign-ins, setup, ad and access changes are recorded from 1 Oct 2026. Before that, only each user's latest sign-in is known.
        {capped ? " This range has more events than we load at once: pick a shorter range or a user." : ""}
      </Typography>

      {!isDesktop ? (
        <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", overflow: "hidden" }}>
          {shown.map((e, i) => {
            const account = e.accountId ? byId.get(e.accountId) : undefined;
            const name = who(e);
            const expanded = open === e.id;
            return (
              <Box key={e.id} sx={{ borderTop: i ? `1px solid ${tokens.divider}` : 0 }}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setOpen(expanded ? null : e.id)}
                  aria-expanded={expanded}
                  sx={{ display: "flex", gap: 1.25, alignItems: "flex-start", width: "100%", textAlign: "left", font: "inherit", color: "inherit", bgcolor: "transparent", border: 0, p: "12px 12px 12px 14px", minHeight: 64, cursor: "pointer" }}
                >
                  <ActionIcon e={e} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                      <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, lineHeight: 1.3 }}>{e.action}</Typography>
                      <Typography sx={{ flex: "none", fontSize: 12.5, color: "text.secondary" }}>{timeAgo(e.at)}</Typography>
                    </Box>
                    {e.target && <Typography sx={{ fontSize: 13, color: "text.secondary", overflowWrap: "anywhere" }}>{e.target}</Typography>}
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5, fontSize: 12.5, color: "text.secondary", flexWrap: "wrap" }}>
                      <Avatar sx={{ width: 18, height: 18, fontSize: 9, bgcolor: e.actorId ? undefined : tokens.surface2, color: e.actorId ? undefined : "text.secondary" }}>{initials(name)}</Avatar>
                      <Box component="span" sx={{ color: "text.primary", fontWeight: 500 }}>{name}</Box>
                      {account && account.id !== e.actorId && <Box component="span">in {account.name}</Box>}
                      {e.country && <Flag code={e.country} />}
                    </Box>
                    {e.before !== undefined && e.after !== undefined && e.action === "Moved lead" && (
                      <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.25 }}>{e.before || "—"} → {e.after || "—"}</Typography>
                    )}
                  </Box>
                  {expanded ? <ExpandLessIcon fontSize="small" sx={{ color: "text.secondary", mt: 0.25 }} /> : <ExpandMoreIcon fontSize="small" sx={{ color: "text.secondary", mt: 0.25 }} />}
                </Box>
                <Collapse in={expanded} unmountOnExit>
                  <Box sx={{ px: 2, py: 1.5, bgcolor: tokens.surface2, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
                    <Detail stacked k="Exact time" v={fullDate(e.at)} />
                    <Detail stacked k="Category" v={CATEGORY_LABEL[e.category]} />
                    <Detail stacked k="Done by" v={e.actorId ? `${name} (${byId.get(e.actorId)?.role ?? "User"})` : name} />
                    <Detail stacked k="In account" v={account?.name ?? ""} />
                    {e.target && <Detail stacked wide k={e.category === "leads" || e.category === "automations" ? "Lead" : "Details"} v={e.target} />}
                    {e.before !== undefined && <Detail stacked wide k="Before" v={e.before} />}
                    {e.after !== undefined && <Detail stacked wide k={e.action.startsWith("WhatsApp") ? "Automation" : "After"} v={e.after} />}
                    <Detail stacked k="Done from" v={e.via} />
                    <Detail stacked k="Device" v={e.device || "Not recorded"} />
                    {e.location && <Detail stacked k="Location" v={e.location} />}
                    {e.ip && <Detail stacked k="IP address" v={e.ip} />}
                  </Box>
                </Collapse>
              </Box>
            );
          })}
          {!shown.length && <Typography sx={{ textAlign: "center", py: 5, color: "text.secondary" }}>Nothing matches these filters.</Typography>}
        </Box>
      ) : (
      <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "4px", bgcolor: "background.paper", overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortHead k="when" label="When" sort={sort} onSort={onSort} firstDir="desc" />
              <SortHead k="who" label="Who" sort={sort} onSort={onSort} />
              {isDesktop && <SortHead k="account" label="Account" sort={sort} onSort={onSort} />}
              <SortHead k="what" label="What" sort={sort} onSort={onSort} />
              {isDesktop && <SortHead k="device" label="Device" sort={sort} onSort={onSort} />}
              <PlainHead sx={{ width: 48 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((e) => {
              const account = e.accountId ? byId.get(e.accountId) : undefined;
              const name = who(e);
              const expanded = open === e.id;
              const onBehalf = !!e.actorId && !!e.accountId && e.actorId !== e.accountId;
              return (
                <Fragment key={e.id}>
                  <TableRow hover onClick={() => setOpen(expanded ? null : e.id)} sx={{ cursor: "pointer", "& > td": { borderBottom: expanded ? 0 : undefined } }}>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 13 }} title={fullDate(e.at)}>{timeAgo(e.at)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Avatar sx={{ width: 26, height: 26, fontSize: 11, bgcolor: e.actorId ? undefined : tokens.surface2, color: e.actorId ? undefined : "text.secondary" }}>{initials(name)}</Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: 13.5, fontWeight: e.actorId ? 500 : 400, color: e.actorId ? "text.primary" : "text.secondary" }}>{name}</Typography>
                          {!isDesktop && account && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>in {account.name}</Typography>}
                        </Box>
                      </Box>
                    </TableCell>
                    {isDesktop && (
                      <TableCell sx={{ fontSize: 13 }}>
                        {account?.name ?? "—"}
                        {onBehalf && <Chip size="small" label="on their behalf" sx={{ ml: 0.75, height: 20, fontSize: 11 }} />}
                      </TableCell>
                    )}
                    <TableCell sx={{ fontSize: 13.5 }}>
                      <Box sx={{ display: "flex", gap: 1.25, alignItems: "center" }}>
                        <ActionIcon e={e} />
                        <Box sx={{ minWidth: 0 }}>
                          <Box component="span" sx={{ fontWeight: 500 }}>{e.action}</Box>
                          {e.target && <Box component="span" sx={{ color: "text.secondary" }}> · {e.target}</Box>}
                          <Box sx={{ fontSize: 12, color: "text.secondary" }}>
                            {e.before !== undefined && e.after !== undefined && e.action === "Moved lead" ? `${e.before || "—"} → ${e.after || "—"}` : CATEGORY_LABEL[e.category]}
                            {!isDesktop && e.country && <> · <Flag code={e.country} /></>}
                          </Box>
                        </Box>
                      </Box>
                    </TableCell>
                    {isDesktop && (
                      <TableCell sx={{ fontSize: 12.5, color: "text.secondary", whiteSpace: "nowrap" }}>
                        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}><Flag code={e.country} />{e.device || e.via}</Box>
                      </TableCell>
                    )}
                    <TableCell padding="checkbox">{expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={6} sx={{ p: 0, bgcolor: tokens.surface2 }}>
                      <Collapse in={expanded} unmountOnExit>
                        <Box sx={{ p: 2, display: "grid", gridTemplateColumns: isDesktop ? "140px 1fr 140px 1fr" : "110px 1fr", rowGap: 0.75, columnGap: 2, fontSize: 13 }}>
                          <Detail k="Exact time" v={fullDate(e.at)} />
                          <Detail k="Category" v={CATEGORY_LABEL[e.category]} />
                          <Detail k="Done by" v={e.actorId ? `${name} (${byId.get(e.actorId)?.role ?? "User"})` : name} />
                          <Detail k="In account" v={account?.name ?? ""} />
                          {e.target && <Detail k={e.category === "leads" || e.category === "automations" ? "Lead" : "Details"} v={e.target} />}
                          {e.before !== undefined && <Detail k="Before" v={e.before} />}
                          {e.after !== undefined && <Detail k={e.action.startsWith("WhatsApp") ? "Automation" : "After"} v={e.after} />}
                          <Detail k="Done from" v={e.via} />
                          <Detail k="Device" v={e.device || "Not recorded"} />
                          {e.location && <Detail k="Location" v={e.location} />}
                          {e.ip && <Detail k="IP address" v={e.ip} />}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
            {!shown.length && (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: "center", py: 5, color: "text.secondary" }}>
                  Nothing matches these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
      )}
    </Box>
  );
}

function Detail({ k, v, stacked, wide }: { k: string; v: string; stacked?: boolean; wide?: boolean }) {
  if (stacked) {
    return (
      <Box sx={{ minWidth: 0, gridColumn: wide ? "1 / -1" : undefined }}>
        <Box sx={{ fontSize: 12, color: "text.secondary" }}>{k}</Box>
        <Box sx={{ fontSize: 13.5, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{v || "—"}</Box>
      </Box>
    );
  }
  return (
    <>
      <Box sx={{ color: "text.secondary" }}>{k}</Box>
      <Box sx={{ wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{v || "—"}</Box>
    </>
  );
}

function UsersTab({ users, onShowActivity }: { users: AuditUser[]; onShowActivity: (u: AuditUser) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const isDesktop = useMediaQuery("(min-width:900px)");
  const { sort, onSort } = useTableSort<UserKey>("estatekit_audit_users_sort", { k: "seen", dir: "desc" }, USER_KEYS);
  const rows = sortRows(
    users.filter((u) => !q.trim() || [u.name, u.email, u.phone, u.company, u.area].join(" ").toLowerCase().includes(q.trim().toLowerCase())),
    (u) => (sort.k === "name" ? u.name : sort.k === "contact" ? u.phone || u.email : sort.k === "company" ? u.company : sort.k === "seen" ? u.lastSeen : sort.k === "leads" ? u.leads : u.status),
    sort.dir,
  );
  const when = (iso: string | null) => (iso ? fullDate(iso) : "Never");

  function exportCsv() {
    download(
      "estatekit-users.csv",
      toCsv([
        ["Name", "Role", "WhatsApp", "Email", "Company", "Area", "Plan", "Status", "Renewal", "Last seen", "Last sign-in", "Last lead action", "Last device", "Last location", "Last IP", "Leads", "Lead pages"],
        ...rows.map((u) => [u.name, u.role, u.phone, u.email, u.company, u.area, u.plan, u.status, u.renewalDate ?? "", when(u.lastSeen), when(u.lastSignIn), when(u.lastLeadAction), u.lastDevice, u.lastLocation, u.lastIp, String(u.leads), String(u.pages)]),
      ]),
    );
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto", p: 2, pb: 6 }}>
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, alignItems: "center" }}>
        <TextField size="small" label="Search users" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: 1, minWidth: 0, maxWidth: 420 }} />
        <Box sx={{ flex: { xs: "none", md: 1 } }} />
        <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={exportCsv}>Export CSV</Button>
      </Box>
      {!isDesktop ? (
        <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", overflow: "hidden" }}>
          {rows.map((u, i) => {
            const expanded = open === u.id;
            return (
              <Box key={u.id} sx={{ borderTop: i ? `1px solid ${tokens.divider}` : 0 }}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setOpen(expanded ? null : u.id)}
                  aria-expanded={expanded}
                  sx={{ display: "flex", gap: 1.25, alignItems: "center", width: "100%", textAlign: "left", font: "inherit", color: "inherit", bgcolor: "transparent", border: 0, p: "12px 12px 12px 14px", minHeight: 64, cursor: "pointer" }}
                >
                  <Avatar sx={{ width: 36, height: 36, fontSize: 13 }}>{initials(u.name)}</Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: 14.5, fontWeight: 600 }}>{u.name}</Typography>
                    <Typography noWrap sx={{ fontSize: 12.5, color: "text.secondary" }}>{u.role} · {u.plan}</Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: 12.5, color: "text.secondary", mt: 0.25 }}>
                      <Flag code={u.lastCountry} />{u.lastSeen ? `Seen ${timeAgo(u.lastSeen)}` : "Never signed in"}
                    </Box>
                  </Box>
                  <Chip size="small" label={u.status} color={u.status === "Active" ? "success" : "warning"} variant="outlined" sx={{ flex: "none" }} />
                  {expanded ? <ExpandLessIcon fontSize="small" sx={{ color: "text.secondary" }} /> : <ExpandMoreIcon fontSize="small" sx={{ color: "text.secondary" }} />}
                </Box>
                <Collapse in={expanded} unmountOnExit>
                  <Box sx={{ px: 2, py: 1.5, bgcolor: tokens.surface2 }}>
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
                            <Detail stacked k="Full name" v={u.name} />
                            <Detail stacked k="Role" v={u.role} />
                            <Detail stacked k="WhatsApp" v={u.phone} />
                            <Detail stacked wide k="Email" v={u.email} />
                            <Detail stacked k="Company" v={u.company} />
                            <Detail stacked k="Area" v={u.area} />
                            <Detail stacked k="Plan" v={u.plan} />
                            <Detail stacked k="Status" v={u.status} />
                            <Detail stacked k="Renewal" v={u.renewalDate ? new Date(u.renewalDate + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : ""} />
                            <Detail stacked k="Last seen" v={when(u.lastSeen)} />
                            <Detail stacked k="Last sign-in" v={when(u.lastSignIn)} />
                            <Detail stacked k="Last lead action" v={when(u.lastLeadAction)} />
                            <Detail stacked wide k="Last device" v={u.lastDevice || "Not recorded"} />
                            <Detail stacked k="Last location" v={u.lastLocation || "Not recorded yet"} />
                            <Detail stacked k="Last IP" v={u.lastIp || "Not recorded yet"} />
                            <Detail stacked k="Leads" v={String(u.leads)} />
                            <Detail stacked k="Lead pages" v={String(u.pages)} />
                    </Box>
                    <Button fullWidth variant="contained" onClick={() => onShowActivity(u)} sx={{ mt: 2 }}>See their activity</Button>
                  </Box>
                </Collapse>
              </Box>
            );
          })}
          {!rows.length && <Typography sx={{ textAlign: "center", py: 5, color: "text.secondary" }}>No users match.</Typography>}
        </Box>
      ) : (
      <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "4px", bgcolor: "background.paper", overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortHead k="name" label="User" sort={sort} onSort={onSort} />
              {isDesktop && <SortHead k="contact" label="Contact" sort={sort} onSort={onSort} />}
              {isDesktop && <SortHead k="company" label="Company" sort={sort} onSort={onSort} />}
              <SortHead k="seen" label="Last seen" sort={sort} onSort={onSort} firstDir="desc" />
              {isDesktop && <SortHead k="leads" label="Leads" sort={sort} onSort={onSort} num />}
              <SortHead k="status" label="Status" sort={sort} onSort={onSort} />
              <PlainHead sx={{ width: 48 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((u) => {
              const expanded = open === u.id;
              return (
                <Fragment key={u.id}>
                  <TableRow hover onClick={() => setOpen(expanded ? null : u.id)} sx={{ cursor: "pointer", "& > td": { borderBottom: expanded ? 0 : undefined } }}>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Avatar sx={{ width: 30, height: 30, fontSize: 12 }}>{initials(u.name)}</Avatar>
                        <Box>
                          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{u.name}</Typography>
                          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{u.role} · {u.plan}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    {isDesktop && (
                      <TableCell sx={{ fontSize: 13 }}>
                        {u.phone || "—"}
                        <Box sx={{ color: "text.secondary", fontSize: 12.5 }}>{u.email}</Box>
                      </TableCell>
                    )}
                    {isDesktop && <TableCell sx={{ fontSize: 13 }}>{u.company || "—"}<Box sx={{ color: "text.secondary", fontSize: 12.5 }}>{u.area}</Box></TableCell>}
                    <TableCell sx={{ fontSize: 13, whiteSpace: "nowrap" }} title={u.lastSeen ? fullDate(u.lastSeen) : ""}>
                      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}><Flag code={u.lastCountry} />{u.lastSeen ? timeAgo(u.lastSeen) : "Never"}</Box>
                    </TableCell>
                    {isDesktop && <TableCell align="right" sx={{ fontSize: 13 }}>{u.leads}</TableCell>}
                    <TableCell>
                      <Chip size="small" label={u.status} color={u.status === "Active" ? "success" : "warning"} variant="outlined" />
                    </TableCell>
                    <TableCell padding="checkbox">{expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={7} sx={{ p: 0, bgcolor: tokens.surface2 }}>
                      <Collapse in={expanded} unmountOnExit>
                        <Box sx={{ p: 2 }}>
                          <Box sx={{ display: "grid", gridTemplateColumns: isDesktop ? "140px 1fr 140px 1fr" : "120px 1fr", rowGap: 0.75, columnGap: 2, fontSize: 13 }}>
                            <Detail k="Full name" v={u.name} />
                            <Detail k="Role" v={u.role} />
                            <Detail k="WhatsApp" v={u.phone} />
                            <Detail k="Email" v={u.email} />
                            <Detail k="Company" v={u.company} />
                            <Detail k="Area" v={u.area} />
                            <Detail k="Plan" v={u.plan} />
                            <Detail k="Status" v={u.status} />
                            <Detail k="Renewal" v={u.renewalDate ? new Date(u.renewalDate + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : ""} />
                            <Detail k="Last seen" v={when(u.lastSeen)} />
                            <Detail k="Last sign-in" v={when(u.lastSignIn)} />
                            <Detail k="Last lead action" v={when(u.lastLeadAction)} />
                            <Detail k="Last device" v={u.lastDevice || "Not recorded"} />
                            <Detail k="Last location" v={u.lastLocation || "Not recorded yet"} />
                            <Detail k="Last IP" v={u.lastIp || "Not recorded yet"} />
                            <Detail k="Leads" v={String(u.leads)} />
                            <Detail k="Lead pages" v={String(u.pages)} />
                          </Box>
                          <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
                            <Button size="small" variant="contained" onClick={() => onShowActivity(u)}>See their activity</Button>
                          </Box>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      )}
    </Box>
  );
}
