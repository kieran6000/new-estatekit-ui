import { Fragment, useMemo, useState } from "react";
import {
  AppBar,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
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
import { useNavigate } from "react-router-dom";
import { tokens } from "../theme";
import { timeAgo } from "../lib/timeAgo";

// Audit log: who did what, to which account, and when. Operators only.
//
// UI ONLY FOR NOW: everything below is SAMPLE data so the layout and filters
// can be signed off first. Today activity goes to Discord (track-activity)
// and isn't stored anywhere we can query. The backend pass adds an
// add-only `audit_log` table (actor_id, account_id, category, action, target,
// before, after, ip, device, session_id, created_at), has track-activity and
// the edge functions write to it, and swaps SAMPLE_* for real queries.

type Category = "login" | "leads" | "setup" | "automations" | "ads" | "account";

const CATEGORY_LABEL: Record<Category, string> = {
  login: "Sign-ins",
  leads: "Leads",
  setup: "Setup changes",
  automations: "Automations",
  ads: "Ads",
  account: "Users & access",
};

interface AuditUser {
  id: string;
  name: string;
  role: "Operator" | "Agent";
  phone: string;
  email: string;
  company: string;
  area: string;
  plan: "Paid" | "Free";
  createdAt: string;
  lastLoginAt: string;
  lastDevice: string;
  lastIp: string;
  status: "Active" | "Paused" | "Disabled";
  leads: number;
  pages: number;
}

interface AuditEvent {
  id: string;
  at: string;
  actorId: string;
  /** The account it happened in. Differs from the actor when an operator works inside a client's account. */
  accountId: string;
  category: Category;
  action: string;
  target?: string;
  before?: string;
  after?: string;
  ip: string;
  device: string;
}

const ago = (mins: number) => new Date(Date.now() - mins * 60000).toISOString();

const SAMPLE_USERS: AuditUser[] = [
  { id: "u1", name: "Kieran (EstateKit)", role: "Operator", phone: "072 555 0101", email: "ops@estatekit.co", company: "EstateKit", area: "—", plan: "Paid", createdAt: ago(60 * 24 * 300), lastLoginAt: ago(12), lastDevice: "Chrome · Windows", lastIp: "102.65.12.4", status: "Active", leads: 0, pages: 0 },
  { id: "u2", name: "Bennie Botha", role: "Operator", phone: "082 555 0102", email: "bennie@estatekit.co", company: "EstateKit", area: "—", plan: "Paid", createdAt: ago(60 * 24 * 280), lastLoginAt: ago(95), lastDevice: "Safari · iPhone", lastIp: "41.13.88.20", status: "Active", leads: 0, pages: 0 },
  { id: "u3", name: "Megan Demo", role: "Agent", phone: "083 555 0103", email: "megan@demo-realty.co.za", company: "Demo Realty", area: "Bryanston", plan: "Paid", createdAt: ago(60 * 24 * 120), lastLoginAt: ago(60 * 5), lastDevice: "Chrome · Android", lastIp: "105.224.3.77", status: "Active", leads: 214, pages: 2 },
  { id: "u4", name: "Sipho Ndlovu", role: "Agent", phone: "084 555 0104", email: "sipho@ndlovuprops.co.za", company: "Ndlovu Properties", area: "Midrand", plan: "Paid", createdAt: ago(60 * 24 * 64), lastLoginAt: ago(60 * 26), lastDevice: "Chrome · Android", lastIp: "197.184.9.51", status: "Active", leads: 131, pages: 1 },
  { id: "u5", name: "Anke de Villiers", role: "Agent", phone: "071 555 0105", email: "anke@capeestates.co.za", company: "Cape Estates", area: "Durbanville", plan: "Free", createdAt: ago(60 * 24 * 21), lastLoginAt: ago(60 * 24 * 9), lastDevice: "Safari · iPhone", lastIp: "41.76.110.2", status: "Paused", leads: 18, pages: 1 },
];

const SAMPLE_EVENTS: AuditEvent[] = [
  { id: "e1", at: ago(12), actorId: "u1", accountId: "u1", category: "login", action: "Signed in", ip: "102.65.12.4", device: "Chrome · Windows" },
  { id: "e2", at: ago(18), actorId: "u1", accountId: "u3", category: "setup", action: "Changed confirmation email wording", target: "Valuation page", before: "Hi {{first_name}}, thanks for…", after: "Hi {{first_name}}, your evaluation is being prepared…", ip: "102.65.12.4", device: "Chrome · Windows" },
  { id: "e3", at: ago(40), actorId: "u3", accountId: "u3", category: "leads", action: "Moved lead", target: "Thandi M.", before: "New Lead", after: "Booked", ip: "105.224.3.77", device: "Chrome · Android" },
  { id: "e4", at: ago(55), actorId: "u3", accountId: "u3", category: "leads", action: "Called lead", target: "Thandi M.", ip: "105.224.3.77", device: "Chrome · Android" },
  { id: "e5", at: ago(95), actorId: "u2", accountId: "u2", category: "login", action: "Signed in", ip: "41.13.88.20", device: "Safari · iPhone" },
  { id: "e6", at: ago(110), actorId: "u2", accountId: "u4", category: "ads", action: "Paused ad", target: "Free selling guide (image)", before: "Active", after: "Paused", ip: "41.13.88.20", device: "Safari · iPhone" },
  { id: "e7", at: ago(180), actorId: "u1", accountId: "u1", category: "automations", action: "Turned off automation", target: "No-answer follow-up", before: "On", after: "Off", ip: "102.65.12.4", device: "Chrome · Windows" },
  { id: "e8", at: ago(60 * 5), actorId: "u3", accountId: "u3", category: "login", action: "Signed in", ip: "105.224.3.77", device: "Chrome · Android" },
  { id: "e9", at: ago(60 * 6), actorId: "u3", accountId: "u3", category: "setup", action: "Changed WhatsApp number", before: "083 555 0000", after: "083 555 0103", ip: "105.224.3.77", device: "Chrome · Android" },
  { id: "e10", at: ago(60 * 26), actorId: "u4", accountId: "u4", category: "login", action: "Signed in", ip: "197.184.9.51", device: "Chrome · Android" },
  { id: "e11", at: ago(60 * 27), actorId: "u4", accountId: "u4", category: "leads", action: "Marked lead lost", target: "Johan P.", before: "No Answer", after: "Lost", ip: "197.184.9.51", device: "Chrome · Android" },
  { id: "e12", at: ago(60 * 30), actorId: "u1", accountId: "u5", category: "account", action: "Paused account", before: "Active", after: "Paused", ip: "102.65.12.4", device: "Chrome · Windows" },
  { id: "e13", at: ago(60 * 31), actorId: "u1", accountId: "u5", category: "account", action: "Reset password", ip: "102.65.12.4", device: "Chrome · Windows" },
  { id: "e14", at: ago(60 * 24 * 3), actorId: "u2", accountId: "u3", category: "setup", action: "Changed page link", target: "Valuation page", before: "/p/megan-val", after: "/p/megan-demo", ip: "41.13.88.20", device: "Safari · iPhone" },
  { id: "e15", at: ago(60 * 24 * 9), actorId: "u5", accountId: "u5", category: "login", action: "Signed in", ip: "41.76.110.2", device: "Safari · iPhone" },
];

const RANGES = [
  { v: "1", label: "Last 24 hours" },
  { v: "7", label: "Last 7 days" },
  { v: "30", label: "Last 30 days" },
  { v: "all", label: "All time" },
];

const fullDate = (iso: string) =>
  new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function initials(name: string) {
  return name.replace(/\(.*?\)/g, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AuditLogPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"activity" | "users">("activity");
  const [selected, setSelected] = useState<AuditUser[]>([]);

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/account")} aria-label="Back to account">
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500, flex: 1 }}>Audit log</Typography>
          <Chip size="small" label="Sample data" color="warning" variant="outlined" />
        </Toolbar>
      </AppBar>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, minHeight: 44, px: 1 }}
      >
        <Tab label="Activity" value="activity" sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }} />
        <Tab label={`Users (${SAMPLE_USERS.length})`} value="users" sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }} />
      </Tabs>
      {tab === "activity" ? (
        <ActivityTab selected={selected} setSelected={setSelected} />
      ) : (
        <UsersTab
          onShowActivity={(u) => {
            setSelected([u]);
            setTab("activity");
          }}
        />
      )}
    </Box>
  );
}

function ActivityTab({ selected, setSelected }: { selected: AuditUser[]; setSelected: (u: AuditUser[]) => void }) {
  const isDesktop = useMediaQuery("(min-width:900px)");
  const [categories, setCategories] = useState<Category[]>([]);
  const [range, setRange] = useState("7");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const userById = (id: string) => SAMPLE_USERS.find((u) => u.id === id);

  const rows = useMemo(() => {
    const since = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
    const ids = new Set(selected.map((u) => u.id));
    const needle = q.trim().toLowerCase();
    return SAMPLE_EVENTS.filter((e) => {
      if (Date.parse(e.at) < since) return false;
      // A selected user matches what they did and what was done in their account.
      if (ids.size && !ids.has(e.actorId) && !ids.has(e.accountId)) return false;
      if (categories.length && !categories.includes(e.category)) return false;
      if (needle) {
        const hay = [e.action, e.target, e.before, e.after, e.ip, userById(e.actorId)?.name, userById(e.accountId)?.name].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [selected, categories, range, q]);

  function exportCsv() {
    download(
      "estatekit-audit-log.csv",
      toCsv([
        ["When", "Who", "Role", "Account", "Category", "Action", "Target", "Before", "After", "IP", "Device"],
        ...rows.map((e) => {
          const a = userById(e.actorId);
          return [fullDate(e.at), a?.name ?? "", a?.role ?? "", userById(e.accountId)?.name ?? "", CATEGORY_LABEL[e.category], e.action, e.target ?? "", e.before ?? "", e.after ?? "", e.ip, e.device];
        }),
      ]),
    );
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto", p: 2, pb: 6 }}>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: isDesktop ? "2fr 1fr 1.4fr" : "1fr", mb: 1.5 }}>
        <Autocomplete
          multiple
          size="small"
          options={SAMPLE_USERS}
          value={selected}
          onChange={(_, v) => setSelected(v)}
          getOptionLabel={(u) => u.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(p) => <TextField {...p} label="Users" placeholder={selected.length ? "" : "All users"} />}
        />
        <TextField select size="small" label="When" value={range} onChange={(e) => setRange(e.target.value)}>
          {RANGES.map((r) => <MenuItem key={r.v} value={r.v}>{r.label}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Search" placeholder="Lead name, IP, wording…" value={q} onChange={(e) => setQ(e.target.value)} />
      </Box>
      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
        {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => {
          const on = categories.includes(c);
          return (
            <Chip
              key={c}
              label={CATEGORY_LABEL[c]}
              color={on ? "primary" : "default"}
              variant={on ? "filled" : "outlined"}
              onClick={() => setCategories(on ? categories.filter((x) => x !== c) : [...categories, c])}
            />
          );
        })}
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{rows.length} event{rows.length === 1 ? "" : "s"}</Typography>
        <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={exportCsv} disabled={!rows.length}>
          Export CSV
        </Button>
      </Box>

      <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "4px", bgcolor: "background.paper", overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Who</TableCell>
              {isDesktop && <TableCell>Account</TableCell>}
              <TableCell>What</TableCell>
              {isDesktop && <TableCell>Device</TableCell>}
              <TableCell padding="checkbox" />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((e) => {
              const actor = userById(e.actorId);
              const account = userById(e.accountId);
              const expanded = open === e.id;
              const onBehalf = e.actorId !== e.accountId;
              return (
                <Fragment key={e.id}>
                  <TableRow hover onClick={() => setOpen(expanded ? null : e.id)} sx={{ cursor: "pointer", "& > td": { borderBottom: expanded ? 0 : undefined } }}>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 13 }} title={fullDate(e.at)}>{timeAgo(e.at)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Avatar sx={{ width: 26, height: 26, fontSize: 11 }}>{initials(actor?.name ?? "?")}</Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{actor?.name}</Typography>
                          {!isDesktop && onBehalf && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>in {account?.name}</Typography>}
                        </Box>
                      </Box>
                    </TableCell>
                    {isDesktop && (
                      <TableCell sx={{ fontSize: 13 }}>
                        {account?.name}
                        {onBehalf && <Chip size="small" label="on their behalf" sx={{ ml: 0.75, height: 20, fontSize: 11 }} />}
                      </TableCell>
                    )}
                    <TableCell sx={{ fontSize: 13.5 }}>
                      <Box component="span" sx={{ fontWeight: 500 }}>{e.action}</Box>
                      {e.target && <Box component="span" sx={{ color: "text.secondary" }}> · {e.target}</Box>}
                      <Box sx={{ mt: 0.25 }}>
                        <Chip size="small" variant="outlined" label={CATEGORY_LABEL[e.category]} sx={{ height: 20, fontSize: 11 }} />
                      </Box>
                    </TableCell>
                    {isDesktop && <TableCell sx={{ fontSize: 12.5, color: "text.secondary", whiteSpace: "nowrap" }}>{e.device}</TableCell>}
                    <TableCell padding="checkbox">{expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={6} sx={{ p: 0, bgcolor: tokens.surface2 }}>
                      <Collapse in={expanded} unmountOnExit>
                        <Box sx={{ p: 2, display: "grid", gridTemplateColumns: isDesktop ? "140px 1fr 140px 1fr" : "110px 1fr", rowGap: 0.75, columnGap: 2, fontSize: 13 }}>
                          <Detail k="Exact time" v={fullDate(e.at)} />
                          <Detail k="Category" v={CATEGORY_LABEL[e.category]} />
                          <Detail k="Done by" v={`${actor?.name} (${actor?.role})`} />
                          <Detail k="In account" v={account?.name ?? ""} />
                          {e.before !== undefined && <Detail k="Before" v={e.before} />}
                          {e.after !== undefined && <Detail k="After" v={e.after} />}
                          <Detail k="IP address" v={e.ip} />
                          <Detail k="Device" v={e.device} />
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: "center", py: 5, color: "text.secondary" }}>
                  Nothing matches these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <>
      <Box sx={{ color: "text.secondary" }}>{k}</Box>
      <Box sx={{ wordBreak: "break-word" }}>{v || "—"}</Box>
    </>
  );
}

function UsersTab({ onShowActivity }: { onShowActivity: (u: AuditUser) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const isDesktop = useMediaQuery("(min-width:900px)");
  const rows = SAMPLE_USERS.filter((u) => !q.trim() || [u.name, u.email, u.phone, u.company, u.area].join(" ").toLowerCase().includes(q.trim().toLowerCase()));

  function exportCsv() {
    download(
      "estatekit-users.csv",
      toCsv([
        ["Name", "Role", "Phone", "Email", "Company", "Area", "Plan", "Status", "Joined", "Last sign-in", "Last device", "Last IP", "Leads", "Pages"],
        ...rows.map((u) => [u.name, u.role, u.phone, u.email, u.company, u.area, u.plan, u.status, fullDate(u.createdAt), fullDate(u.lastLoginAt), u.lastDevice, u.lastIp, String(u.leads), String(u.pages)]),
      ]),
    );
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto", p: 2, pb: 6 }}>
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, alignItems: "center" }}>
        <TextField size="small" label="Search users" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: 1, maxWidth: 420 }} />
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={exportCsv}>Export CSV</Button>
      </Box>
      <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "4px", bgcolor: "background.paper", overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>User</TableCell>
              {isDesktop && <TableCell>Contact</TableCell>}
              {isDesktop && <TableCell>Company</TableCell>}
              <TableCell>Last sign-in</TableCell>
              <TableCell>Status</TableCell>
              <TableCell padding="checkbox" />
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
                        {u.phone}
                        <Box sx={{ color: "text.secondary", fontSize: 12.5 }}>{u.email}</Box>
                      </TableCell>
                    )}
                    {isDesktop && <TableCell sx={{ fontSize: 13 }}>{u.company}<Box sx={{ color: "text.secondary", fontSize: 12.5 }}>{u.area}</Box></TableCell>}
                    <TableCell sx={{ fontSize: 13, whiteSpace: "nowrap" }} title={fullDate(u.lastLoginAt)}>{timeAgo(u.lastLoginAt)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={u.status} color={u.status === "Active" ? "success" : u.status === "Paused" ? "warning" : "default"} variant="outlined" />
                    </TableCell>
                    <TableCell padding="checkbox">{expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={6} sx={{ p: 0, bgcolor: tokens.surface2 }}>
                      <Collapse in={expanded} unmountOnExit>
                        <Box sx={{ p: 2 }}>
                          <Box sx={{ display: "grid", gridTemplateColumns: isDesktop ? "140px 1fr 140px 1fr" : "110px 1fr", rowGap: 0.75, columnGap: 2, fontSize: 13 }}>
                            <Detail k="Full name" v={u.name} />
                            <Detail k="Role" v={u.role} />
                            <Detail k="Phone" v={u.phone} />
                            <Detail k="Email" v={u.email} />
                            <Detail k="Company" v={u.company} />
                            <Detail k="Area" v={u.area} />
                            <Detail k="Plan" v={u.plan} />
                            <Detail k="Status" v={u.status} />
                            <Detail k="Joined" v={fullDate(u.createdAt)} />
                            <Detail k="Last sign-in" v={fullDate(u.lastLoginAt)} />
                            <Detail k="Last device" v={u.lastDevice} />
                            <Detail k="Last IP" v={u.lastIp} />
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
    </Box>
  );
}
