import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link as RouterLink, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Link,
  Skeleton,
  Switch,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import PhoneIcon from "@mui/icons-material/Phone";
import MailOutlineIcon from "@mui/icons-material/MailOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LoginIcon from "@mui/icons-material/Login";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import LockResetIcon from "@mui/icons-material/LockReset";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { tokens } from "../theme";
import { AccountStatusSection, DeactivatedBanner } from "../components/AccountStatus";
import TeamSection from "../components/TeamSection";
import {
  adsManagerUrl,
  clientPicture,
  fundingKind,
  getClient,
  hasPaymentProblem,
  getResultsBetween,
  getSpendDaily,
  saveClientDossier,
  spendBetween,
  updateClientProfile,
  uploadClientPhoto,
  type ClientDossier,
  type ClientProfilePatch,
} from "../api/clients";
import { getFbAdAccount, setAgentPassword } from "../api/agentProfile";
import { listAccountWorkflows } from "../api/workflows";
import { setActiveAgent, supabase } from "../api/_client";
import { getEmailStats } from "../api/leadEvents";
import { listSignupRequests } from "../api/signup";
import { BRIEF_FIELDS, BRIEF_QUESTIONS, buildBrief, type BriefSource } from "../lib/brief";
import { resolveRange, useDateRange, ymd } from "../lib/range";
import { useAuth } from "../hooks/useAuth";
import { useSnack } from "../hooks/useSnack";
import { trackActivity } from "../lib/activity";
import { timeAgo } from "../lib/timeAgo";
import RangePicker from "../components/RangePicker";
import AdsTable, { type AdsView } from "../components/AdsTable";
import { clientPath, isAgentId, resolveClient, CLIENT_TABS, type ClientTab } from "../lib/clientSlug";
import { getAdHistory, getAdsTable, type AdsLevel } from "../api/agentProfile";
import { listAgentProfiles } from "../api/_client";
import type { DateRange, RangeKey } from "../lib/range";
import { RANGE_LABELS } from "../lib/range";
import { useFollowAccount } from "../hooks/useFollowLeadAccount";
import { formatMetric, metricValues, type MetricKey } from "../lib/adTargets";
import { MAX_IMAGE_BYTES, uploadImage } from "../lib/image";
import FundingChip from "../components/FundingChip";

/** Digits in international form, so 083… and +2783… compare equal. */
const digits = (s: string) => {
  const d = (s || "").replace(/\D/g, "");
  return d.length === 10 && d.startsWith("0") ? "27" + d.slice(1) : d;
};
// Lists are typed with ";" between items, the same as form answer options.
const splitList = (s: string) => s.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
// "Stanley 063 152 5310" ⇄ { name: "Stanley", phone: "+27631525310" }.
const contactText = (c: { name?: string | null; phone: string }) => [c.name, c.phone].filter(Boolean).join(" ");
const parseContact = (entry: string) => {
  const phone = digits(entry.replace(/[^\d+]/g, ""));
  const name = entry.replace(/[+\d()\-.\s]{6,}/g, " ").replace(/\s+/g, " ").trim();
  return { name: name || null, phone: phone ? "+" + phone : "" };
};
const money = (n: number) => "R" + Math.round(n).toLocaleString("en-ZA");

// Onboarding answers already shown in Contact or the section header.
const SHOWN_ELSEWHERE = new Set(["Full name", "Email", "Phone", "Submitted"]);
type Data = Awaited<ReturnType<typeof getClient>>;
type TabKey = ClientTab;

/** Operators: one account, at /clients/<their-name>/<tab>. Overview (the
 *  numbers and their ads), History (what changed on their ads), Brief
 *  (onboarding answers) and Settings (everything editable). Dates and where
 *  you are in their ads are in the address too, so a link opens the same
 *  view and Back steps through it. */
export default function ClientDetailPage() {
  const { who = "", tab: tabParam } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data: profiles } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles, staleTime: 5 * 60_000 });
  const agentId = profiles ? resolveClient(who, profiles) ?? "" : isAgentId(who) ? who : "";
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["client", agentId], queryFn: () => getClient(agentId), enabled: !!agentId });
  // Their page is the account you're working in (it replaced /overview and,
  // for staff, /account): opening it switches you into them.
  useFollowAccount(agentId ? { agent_id: agentId } : null, "account");
  const tab: TabKey = CLIENT_TABS.includes(tabParam as TabKey) ? (tabParam as TabKey) : "overview";
  const search = params.toString() ? `?${params.toString()}` : "";
  // Tabs are pages: Back goes to the tab you were on. Only the dates carry
  // over (where you were in the ads is Overview's own).
  const dates = new URLSearchParams([...params].filter(([k]) => k === "range" || k === "from" || k === "to")).toString();
  const pick = (t: TabKey) => navigate(`${clientPath(agentId, profiles, t)}${(t === "overview" || t === "history") && dates ? `?${dates}` : ""}`);

  // Old addresses (the id, or no tab) move to /clients/<name>/<tab>.
  if (profiles && agentId) {
    const want = clientPath(agentId, profiles, tab);
    const here = `/clients/${who}/${tabParam ?? ""}`;
    if (here !== want) return <Navigate to={`${want}${search}`} replace />;
  }
  if (profiles && !agentId) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography sx={{ fontWeight: 500 }}>There's no account at this address.</Typography>
        <Button component={RouterLink} to="/clients" sx={{ mt: 1 }}>Back to Accounts</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/clients")} aria-label="Back to accounts">
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {data?.profile.display_name || "Account"}
          </Typography>
          <Box sx={{ flex: 1 }} />
          {agentId && (
            <Button
              component="a"
              href={`/report/${agentId}`}
              target="_blank"
              rel="noopener"
              size="small"
              sx={{ color: "inherit", whiteSpace: "nowrap" }}
            >
              Weekly report
            </Button>
          )}
        </Toolbar>
      </AppBar>

      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
          <CircularProgress />
        </Box>
      )}
      {isError && (
        <Box sx={{ p: 4 }}>
          <Typography sx={{ fontWeight: 500 }}>
            {(error as Error)?.message === "not_found" ? "This account doesn't exist any more." : "Couldn't load this account."}
          </Typography>
          <Typography sx={{ color: tokens.ink2, mt: 0.5, fontSize: 14 }}>Go back to Accounts and pick them again, or refresh the page.</Typography>
        </Box>
      )}

      {data && (
        <>
          <Header data={data} />
          <DeactivatedBanner profile={data.profile} />
          <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
            <Box sx={{ maxWidth: 1440, mx: "auto", px: { xs: 0.5, md: 2 } }}>
              <Tabs value={tab} onChange={(_e, v) => pick(v)} variant="scrollable" allowScrollButtonsMobile>
                <Tab value="overview" label="Overview" />
                <Tab value="history" label="History" />
                <Tab value="brief" label="Brief" />
                <Tab value="settings" label="Settings" />
              </Tabs>
            </Box>
          </Box>
          <Box sx={{ p: { xs: 1.5, md: 2.5 }, maxWidth: 1440, mx: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {tab === "overview" && <OverviewTab data={data} />}
            {tab === "history" && <HistoryTab data={data} />}
            {tab === "brief" && (
              <Cols>
                <BriefSection data={data} />
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <OtherAnswersSection data={data} />
                  {data.dossier?.onboardingExtra && <OnboardingSection data={data} which="onboardingExtra" />}
                </Box>
              </Cols>
            )}
            {tab === "settings" && <SettingsTab data={data} />}
          </Box>
        </>
      )}
    </Box>
  );
}

/** Saves, then refreshes every list that shows this client. */
function useClientSaver(agentId: string) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  return async (work: () => Promise<void>, done = "Saved") => {
    try {
      await work();
      trackActivity(done.startsWith("Confirmation email") ? "email_switched" : "client_details_edited", { agentId, detail: done });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["client", agentId] }),
        qc.invalidateQueries({ queryKey: ["clients"] }),
        qc.invalidateQueries({ queryKey: ["agentProfiles"] }),
        qc.invalidateQueries({ queryKey: ["myProfile"] }),
      ]);
      showSnack(done);
      return true;
    } catch (e) {
      console.error(e);
      showSnack("Couldn't save that. Check your connection and try again.");
      return false;
    }
  };
}

/* ───────────────────────── header ───────────────────────── */

function Header({ data }: { data: Data }) {
  const { profile: p, dossier: d } = data;
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const save = useClientSaver(p.agent_id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const name = p.display_name || p.whatsapp_number || "Unnamed account";
  const phone = p.whatsapp_number || d?.contact.phones[0] || "";
  const email = p.email || d?.contact.emails[0] || "";

  function openDashboard() {
    setActiveAgent(p.agent_id === user?.id ? null : p.agent_id);
    qc.invalidateQueries();
    navigate("/leads");
  }

  async function onPhoto(file: File | undefined) {
    if (!file || !user) return;
    setUploading(true);
    await save(async () => {
      const url = await uploadClientPhoto(user.id, file);
      await updateClientProfile(p.agent_id, { avatar_url: url });
    }, "Photo updated");
    setUploading(false);
  }

  return (
    <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
      <Box sx={{ maxWidth: 1440, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 2, md: 2.5 }, display: "flex", gap: { xs: 2, md: 3 }, alignItems: { xs: "flex-start", md: "center" }, flexDirection: { xs: "column", md: "row" } }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flex: 1, minWidth: 0 }}>
          <Box
            component="button"
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Change photo"
            sx={{ position: "relative", p: 0, border: 0, bgcolor: "transparent", borderRadius: "50%", cursor: "pointer", flexShrink: 0, "&:hover .cam, &:focus-visible .cam": { opacity: 1 } }}
          >
            <Avatar src={clientPicture(p)} alt={name} sx={{ width: 72, height: 72, fontSize: 28, fontWeight: 600, bgcolor: p.sidebar_color || "#111827" }}>
              {name[0]?.toUpperCase()}
            </Avatar>
            <Box
              className="cam"
              sx={{
                position: "absolute", inset: 0, borderRadius: "50%", bgcolor: "rgba(0,0,0,.45)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", opacity: uploading ? 1 : 0, transition: "opacity .15s",
              }}
            >
              {uploading ? <CircularProgress size={22} sx={{ color: "#fff" }} /> : <PhotoCameraOutlinedIcon />}
            </Box>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{name}</Typography>
            <Typography sx={{ fontSize: 14, color: tokens.ink2, mt: 0.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {[p.company || "No agency on file", p.area].filter(Boolean).join(" · ")}
            </Typography>
            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 1, "&:empty": { display: "none" } }}>
              {p.deactivated_at ? <Chip size="small" color="warning" label="Deactivated" /> : p.automations_paused && <Chip size="small" color="warning" variant="outlined" label="Automations paused" />}
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button variant="contained" startIcon={<LoginIcon />} onClick={openDashboard} sx={{ width: { xs: "100%", sm: "auto" }, minHeight: 44 }}>Open their dashboard</Button>
          {p.fb_ad_account_id && (
            <Button variant="outlined" endIcon={<OpenInNewIcon />} href={adsManagerUrl(p.fb_ad_account_id)} target="_blank" rel="noopener">
              Ads Manager
            </Button>
          )}
          {phone && (
            <Tooltip title="WhatsApp">
              <IconButton href={`https://wa.me/${digits(phone)}`} target="_blank" rel="noopener" aria-label="WhatsApp" sx={{ border: `1px solid ${tokens.divider}` }}>
                <WhatsAppIcon />
              </IconButton>
            </Tooltip>
          )}
          {phone && (
            <Tooltip title="Call">
              <IconButton href={`tel:+${digits(phone)}`} aria-label="Call" sx={{ border: `1px solid ${tokens.divider}` }}>
                <PhoneIcon />
              </IconButton>
            </Tooltip>
          )}
          {email && (
            <Tooltip title="Email">
              <IconButton href={`mailto:${email}`} aria-label="Email" sx={{ border: `1px solid ${tokens.divider}` }}>
                <MailOutlineIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/* ───────────────────────── building blocks ───────────────────────── */

/** Two columns on a computer, one on a phone. */
function Cols({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 2, alignItems: "start" }}>
      {children}
    </Box>
  );
}

/** Settings in groups, each with a heading and a line on what's in it, and
 *  (on a computer) a menu on the left that jumps to a group and shows which
 *  one you're in. */
function SettingsTab({ data }: { data: Data }) {
  const wide = useMediaQuery("(min-width:1000px)");
  const groups: { id: string; title: string; sub: string; body: ReactNode }[] = [
    { id: "profile", title: "Profile", sub: "Who they are, how to reach them, and how their pages look.", body: <><ProfileSection data={data} /><ContactSection data={data} /><BrandingSection data={data} /></> },
    { id: "access", title: "Login & team", sub: "How they sign in, and who works with them.", body: <><LoginSection data={data} /><TeamSection agentId={data.profile.agent_id} name={data.profile.display_name || "This agent"} /></> },
    { id: "ads", title: "Ads & Facebook", sub: "Their ad account, Facebook page and where their leads come from.", body: <><AdAccountSection data={data} /><FacebookSection data={data} /><LandingPagesSection data={data} /></> },
    { id: "messages", title: "Messages", sub: "Automations and emails that go to their leads.", body: <MessagesSection data={data} /> },
    { id: "billing", title: "Billing & contract", sub: "Their plan, renewal and payments.", body: <><ContractSection data={data} /><BillingSection data={data} /></> },
    { id: "account", title: "Account", sub: "Pause or close their account.", body: <AccountStatusSection profile={data.profile} /> },
  ];
  const [current, setCurrent] = useState(groups[0].id);
  // The group nearest the top of the screen is the one lit in the menu.
  useEffect(() => {
    const els = groups.map((g) => document.getElementById(`set-${g.id}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setCurrent(top.target.id.replace("set-", ""));
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const jump = (id: string) => document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: wide ? "200px minmax(0, 1fr)" : "1fr", gap: 4, alignItems: "start" }}>
      {wide && (
        <Box component="nav" aria-label="Settings sections" sx={{ position: "sticky", top: 72, display: "flex", flexDirection: "column", gap: 0.25 }}>
          {groups.map((g) => (
            <Button
              key={g.id}
              onClick={() => jump(g.id)}
              aria-current={current === g.id ? "true" : undefined}
              sx={{
                justifyContent: "flex-start", textTransform: "none", fontSize: 14, px: 1.5, minHeight: 40, borderRadius: "6px",
                color: current === g.id ? tokens.primary : tokens.ink2, fontWeight: current === g.id ? 600 : 400,
                bgcolor: current === g.id ? tokens.primaryBg : "transparent",
                "&:hover": { bgcolor: current === g.id ? tokens.primaryBg : tokens.hover },
              }}
            >
              {g.title}
            </Button>
          ))}
        </Box>
      )}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 5, maxWidth: 820, minWidth: 0 }}>
        {groups.map((g) => (
          <Box key={g.id} id={`set-${g.id}`} component="section" aria-labelledby={`set-${g.id}-h`} sx={{ scrollMarginTop: 72 }}>
            <Typography id={`set-${g.id}-h`} component="h2" sx={{ fontSize: 18, fontWeight: 600 }}>{g.title}</Typography>
            <Typography sx={{ fontSize: 13.5, color: tokens.ink2, mt: 0.25, mb: 1.75 }}>{g.sub}</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>{g.body}</Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Their colour and logo: the sidebar, lead pages and Facebook-form
 *  thank-you pages use them (moved here from the Account page). */
function BrandingSection({ data }: { data: Data }) {
  const p = data.profile;
  const save = useClientSaver(p.agent_id);
  const showSnack = useSnack();
  const saved = p.sidebar_color || "#111827";
  const [color, setColor] = useState(saved);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) { showSnack("That image is too big. Try another one."); return; }
    setBusy(true);
    try {
      const url = await uploadImage(file, "logo", p.agent_id);
      await save(() => updateClientProfile(p.agent_id, { sidebar_logo_url: url }), "Logo saved");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't upload the logo. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Branding">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 1.25, cursor: "pointer" }}>
            <Box component="input" type="color" value={color} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColor(e.target.value)} aria-label="Colour" sx={{ width: 44, height: 44, p: 0, border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "transparent", cursor: "pointer" }} />
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 500 }}>Colour</Typography>
              <Typography sx={{ fontSize: 12.5, color: tokens.ink2 }}>{color.toUpperCase()} · sidebar and pages</Typography>
            </Box>
          </Box>
          {color.toLowerCase() !== saved.toLowerCase() && (
            <Button size="small" variant="contained" disabled={busy} onClick={() => void save(() => updateClientProfile(p.agent_id, { sidebar_color: color }), "Colour saved")}>Save colour</Button>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <Box sx={{ width: 120, height: 44, borderRadius: "8px", bgcolor: saved, display: "grid", placeItems: "center", overflow: "hidden", flex: "none" }}>
            {p.sidebar_logo_url
              ? <Box component="img" src={p.sidebar_logo_url} alt="Logo" sx={{ maxWidth: "90%", maxHeight: 32 }} />
              : <Typography sx={{ fontSize: 12, color: "#fff", opacity: 0.8 }}>No logo</Typography>}
          </Box>
          <Button size="small" variant="outlined" startIcon={<UploadFileIcon />} disabled={busy} onClick={() => fileRef.current?.click()}>
            {p.sidebar_logo_url ? "Change logo" : "Upload logo"}
          </Button>
          {p.sidebar_logo_url && (
            <Button size="small" color="error" disabled={busy} onClick={() => void save(() => updateClientProfile(p.agent_id, { sidebar_logo_url: null }), "Logo removed")}>Remove</Button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ""; }} />
        </Box>
      </Box>
    </Section>
  );
}

function Section({ title, children, sub, action }: { title: string; children: ReactNode; sub?: string; action?: ReactNode }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", minWidth: 0 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, display: "flex", alignItems: "center", gap: 1, minHeight: 44 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: 1 }}>{title}</Typography>
        {sub && <Typography sx={{ fontSize: 11.5, color: tokens.ink3 }}>{sub}</Typography>}
        {action}
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>{children}</Box>
    </Box>
  );
}

interface FieldDef {
  key: string;
  label: string;
  value: string;
  helper?: string;
  multiline?: boolean;
  placeholder?: string;
}

/** A section that shows `view` normally and a form of `fields` while editing.
 *  onSave gets every field's value and returns an error message to keep the
 *  form open, or nothing when it saved. */
function EditableSection({
  title,
  sub,
  view,
  fields,
  onSave,
}: {
  title: string;
  sub?: string;
  view: ReactNode;
  fields: FieldDef[];
  onSave: (v: Record<string, string>) => Promise<string | void>;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function start() {
    setValues(Object.fromEntries(fields.map((f) => [f.key, f.value])));
    setErr("");
    setEditing(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const trimmed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()]));
    const problem = await onSave(trimmed);
    setBusy(false);
    if (problem) setErr(problem);
    else setEditing(false);
  }

  return (
    <Section
      title={title}
      sub={editing ? undefined : sub}
      action={
        !editing && (
          <Button size="small" startIcon={<EditOutlinedIcon sx={{ fontSize: "16px !important" }} />} onClick={start} sx={{ my: -0.5 }}>
            Edit
          </Button>
        )
      }
    >
      {editing ? (
        <Box component="form" onSubmit={submit} sx={{ display: "flex", flexDirection: "column", gap: 1.75, pt: 0.5 }}>
          {fields.map((f, i) => (
            <TextField
              key={f.key}
              label={f.label}
              size="small"
              fullWidth
              autoFocus={i === 0}
              multiline={f.multiline}
              minRows={f.multiline ? 2 : undefined}
              placeholder={f.placeholder}
              helperText={f.helper}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          ))}
          {err && <Typography sx={{ fontSize: 13, color: tokens.red }}>{err}</Typography>}
          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <Button onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </Box>
        </Box>
      ) : (
        view
      )}
    </Section>
  );
}

function KV({ rows, labelWidth = "38%" }: { rows: [string, ReactNode][]; labelWidth?: string }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false);
  if (!shown.length) return <Empty>Nothing on file.</Empty>;
  return (
    <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: `minmax(110px, ${labelWidth}) 1fr`, columnGap: 1.5, rowGap: 0.875 }}>
      {shown.map(([k, v]) => (
        <Box key={k} sx={{ display: "contents" }}>
          <Box component="dt" sx={{ fontSize: 13, color: tokens.ink2 }}>{k}</Box>
          <Box component="dd" sx={{ m: 0, fontSize: 13.5, color: tokens.ink, wordBreak: "break-word" }}>{v}</Box>
        </Box>
      ))}
    </Box>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <Typography sx={{ fontSize: 13.5, color: tokens.ink3 }}>{children}</Typography>;
}

function Bars({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <Empty>No leads yet.</Empty>;
  const total = entries.reduce((a, [, n]) => a + n, 0);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      {entries.map(([k, n]) => (
        <Box key={k}>
          <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span>{k}</span>
            <Box component="span" sx={{ color: tokens.ink2, fontVariantNumeric: "tabular-nums" }}>
              {n} · {Math.round((n / total) * 100)}%
            </Box>
          </Box>
          <Box sx={{ height: 6, bgcolor: tokens.surface2, borderRadius: 3, mt: 0.375, overflow: "hidden" }}>
            <Box sx={{ height: "100%", width: `${Math.max(2, (n / total) * 100)}%`, bgcolor: tokens.ink3, borderRadius: 3 }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} target="_blank" rel="noopener" underline="hover" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: 13.5 }}>
      {children}
      <OpenInNewIcon sx={{ fontSize: 14 }} />
    </Link>
  );
}

/* ───────────────────────── overview ───────────────────────── */

function Tile({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: "warning"; hint?: string }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tone === "warning" ? tokens.amberBorder : tokens.divider}`, borderRadius: "8px", px: 2, py: 1.5, minWidth: 0 }}>
      <Typography component="div" sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</Typography>
      <Tooltip title={hint ?? ""} disableHoverListener={!hint}>
        <Typography sx={{ fontSize: 12.5, color: tokens.ink2, mt: 0.25 }}>{label}</Typography>
      </Tooltip>
    </Box>
  );
}

/** The dates, from the address (?range=7d, or ?range=custom&from=&to=),
 *  else the last ones used here. Changing them changes the address. */
function useRangeParam(): [DateRange, (r: DateRange) => void] {
  const [params, setParams] = useSearchParams();
  const [stored, setStored] = useDateRange("estatekit_account_range");
  const key = params.get("range") as RangeKey | null;
  const range: DateRange = key && key in RANGE_LABELS
    ? { key, from: params.get("from") ?? undefined, to: params.get("to") ?? undefined }
    : stored;
  const set = (r: DateRange) => {
    setStored(r);
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("range", r.key);
      if (r.key === "custom" && r.from && r.to) { n.set("from", r.from); n.set("to", r.to); } else { n.delete("from"); n.delete("to"); }
      return n;
    }, { replace: true });
  };
  return [range, set];
}

function OverviewTab({ data }: { data: Data }) {
  const p = data.profile;
  const agentId = p.agent_id;
  const acct = p.fb_ad_account_id;
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useRangeParam();
  const { since, until } = resolveRange(range);
  const sinceDay = ymd(since);
  const lastDay = ymd(new Date(until.getTime() - 1));

  // Where you are in their ads (?level=adset&campaign=…&adset=…). Each step
  // in is a new page, so Back steps out again.
  const level = (["campaign", "adset", "ad"].includes(params.get("level") ?? "") ? params.get("level") : "campaign") as AdsLevel;
  const view: AdsView = { level, campaignId: params.get("campaign"), adsetId: params.get("adset") };
  const setView = (v: AdsView) => setParams((cur) => {
    const n = new URLSearchParams(cur);
    if (v.level === "campaign") n.delete("level"); else n.set("level", v.level);
    if (v.campaignId) n.set("campaign", v.campaignId); else n.delete("campaign");
    if (v.adsetId) n.set("adset", v.adsetId); else n.delete("adset");
    return n;
  });

  // The account's Facebook totals (shared with the table's Campaigns view).
  const { data: fb, isLoading: fbLoading } = useQuery({
    queryKey: ["adsTable", acct, sinceDay, lastDay, "campaign", null, null],
    queryFn: () => getAdsTable(acct!, sinceDay, lastDay, { level: "campaign" }),
    enabled: !!acct,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const { data: r, isLoading } = useQuery({
    queryKey: ["resultsBetween", agentId, sinceDay, ymd(until)],
    queryFn: () => getResultsBetween(agentId, since, until),
    staleTime: 60_000,
  });
  const a = fb?.account ? metricValues(fb.account) : null;
  const fbTile = (k: MetricKey) => (!acct ? "—" : fbLoading ? <Skeleton width={70} /> : a ? formatMetric(k, a[k]) : "—");
  const v = (n: number | undefined) => (isLoading ? <Skeleton width={40} /> : (n ?? 0));

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1.5, flexWrap: "wrap" }}>
        <RangePicker value={range} onChange={setRange} />
      </Box>

      {/* Facebook's numbers, in Facebook's words; then what came of the leads here. */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)", xl: "repeat(8, 1fr)" }, gap: 1.5 }}>
        <Tile label="Amount spent" value={fbTile("spend")} />
        <Tile label="Leads" value={fbTile("leads")} />
        <Tile label="Cost per lead" value={fbTile("cpl")} />
        <Tile label="Impressions" value={fbTile("impressions")} />
        <Tile label="Reach" value={fbTile("reach")} />
        <Tile label="CTR (link click-through rate)" value={fbTile("ctr")} />
        <Tile label="Booked" value={v(r?.booked)} hint="Leads booked for an appointment in EstateKit" />
        <Tile label="Mandates" value={v(r?.mandates)} hint="Mandates signed in EstateKit" />
      </Box>

      <AdsTable
        adAccountId={acct ?? null}
        since={sinceDay}
        until={lastDay}
        view={view}
        onView={setView}
        pageName={p.display_name || "Their page"}
        pageAvatar={clientPicture(p)}
      />

      <Cols>
        <Section title="Leads by stage" sub="All time">
          <Bars data={data.live?.by_stage ?? {}} />
          <Typography sx={{ fontSize: 12.5, color: tokens.ink3, mt: 1.5 }}>
            {data.live?.leads_total ?? 0} leads in total · last lead {data.live?.last_lead_at ? timeAgo(data.live.last_lead_at) : "never"}
          </Typography>
        </Section>
        <EmailStatsSection data={data} since={since} until={until} />
      </Cols>
    </>
  );
}

/** What changed on their ads, from Facebook's activity log (Ads Manager's
 *  Account history), newest first, by day. */
function HistoryTab({ data }: { data: Data }) {
  const acct = data.profile.fb_ad_account_id;
  const [range, setRange] = useRangeParam();
  const { since, until } = resolveRange(range);
  const sinceDay = ymd(since);
  const lastDay = ymd(new Date(until.getTime() - 1));
  const { data: h, isLoading, isError } = useQuery({
    queryKey: ["adHistory", acct, sinceDay, lastDay],
    queryFn: () => getAdHistory(acct!, sinceDay, lastDay),
    enabled: !!acct,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const items = h?.items ?? [];
  const days = new Map<string, typeof items>();
  for (const it of items) {
    const d = new Date(it.at).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    days.set(d, [...(days.get(d) ?? []), it]);
  }
  // Facebook's log uses its old names: a campaign group is a campaign, a
  // "campaign" is an ad set, an ad group is an ad.
  const OBJECT: Record<string, string> = { CAMPAIGN_GROUP: "Campaign", CAMPAIGN: "Ad set", ADGROUP: "Ad", AD_SET: "Ad set", AD: "Ad", ACCOUNT: "Ad account", AD_ACCOUNT: "Ad account" };

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1.5, flexWrap: "wrap" }}>
        <RangePicker value={range} onChange={setRange} />
      </Box>
      <Section title="Change history" sub="From Facebook's activity log">
        {!acct ? (
          <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>No ad account linked. Add it under Settings → Ads &amp; Facebook.</Typography>
        ) : isLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} height={48} />)
        ) : isError || h?.note ? (
          <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>
            {h?.note === "busy" ? "Facebook is busy right now. Try again in a few minutes." : "Couldn't read the history from Meta. Try again in a minute."}
          </Typography>
        ) : !items.length ? (
          <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>No changes in these dates.</Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            {[...days.entries()].map(([day, list]) => (
              <Box key={day}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: tokens.ink2, mb: 0.5 }}>{day}</Typography>
                {list.map((it, i) => (
                  <Box key={i} sx={{ display: "grid", gridTemplateColumns: { xs: "56px 1fr", sm: "64px minmax(0, 1fr) 200px" }, gap: 1.5, py: 1.25, borderTop: `1px solid ${tokens.divider2}`, alignItems: "start" }}>
                    <Typography sx={{ fontSize: 13, color: tokens.ink3, fontVariantNumeric: "tabular-nums" }}>
                      {new Date(it.at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                    </Typography>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{it.what}</Typography>
                      <Typography sx={{ fontSize: 13, color: tokens.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {OBJECT[it.objectType] ?? it.objectType}: {it.objectName}
                      </Typography>
                      {it.change && (it.change.from || it.change.to) && (
                        <Typography sx={{ fontSize: 13, mt: 0.25 }}>
                          <Box component="span" sx={{ color: tokens.ink3, textDecoration: "line-through" }}>{it.change.from || "—"}</Box>
                          {"  →  "}
                          <b>{it.change.to || "—"}</b>
                        </Typography>
                      )}
                    </Box>
                    <Typography sx={{ fontSize: 13, color: tokens.ink2, display: { xs: "none", sm: "block" }, textAlign: "right" }}>by {it.who || "Facebook"}</Typography>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        )}
      </Section>
    </>
  );
}

// Meta's ad account statuses, in plain words.
const ACCOUNT_STATUS: Record<number, string> = {
  1: "Active",
  2: "Disabled",
  3: "Unpaid bill",
  7: "Under review",
  8: "Payment pending",
  9: "Grace period",
  100: "Closing",
  101: "Closed",
};

function AdAccountSection({ data }: { data: Data }) {
  const acct = data.profile.fb_ad_account_id;
  const { data: a, isLoading } = useQuery({
    queryKey: ["fbAdAccount", acct],
    queryFn: () => getFbAdAccount(acct!),
    enabled: !!acct,
    staleTime: 60 * 60_000,
    retry: false,
  });
  const since30 = ymd(new Date(Date.now() - 29 * 864e5));
  const { data: daily30 } = useQuery({
    queryKey: ["spendDaily", acct, since30],
    queryFn: () => getSpendDaily(acct!, since30),
    enabled: !!acct,
    staleTime: 30 * 60_000,
    retry: false,
  });
  if (!acct) {
    return (
      <Section title="Ad account">
        <Empty>No ad account linked. Add it under Settings → Facebook.</Empty>
      </Section>
    );
  }
  const kind = fundingKind(a?.fundingType);
  const avgDaily = daily30 ? (spendBetween(daily30, since30, ymd(new Date(Date.now() + 864e5))) ?? 0) / 30 : null;
  const problem = hasPaymentProblem(a, avgDaily);
  return (
    <Section
      title="Ad account"
      action={
        <Button size="small" endIcon={<OpenInNewIcon sx={{ fontSize: "16px !important" }} />} href={adsManagerUrl(acct)} target="_blank" rel="noopener" sx={{ my: -0.5 }}>
          Ads Manager
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton height={90} />
      ) : a?.note ? (
        <Empty>Facebook won't show us this ad account. Check it's shared with EstateKit's Business Manager.</Empty>
      ) : (
        <KV
          rows={[
            [
              "Pays by",
              kind ? (
                <Box component="span" key="pay" sx={{ display: "inline-flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <FundingChip type={a?.fundingType} label={a?.fundingLabel} balance={a?.balance} problem={problem} status={a?.accountStatus} showLabel />
                  {a?.fundingLabel && <Box component="span" sx={{ color: tokens.ink2, fontSize: 13 }}>{a.fundingLabel}</Box>}
                </Box>
              ) : "Not set up",
            ],
            ["Balance due", a?.balance != null && a.balance > 0 ? <Box component="span" key="due" sx={problem ? { color: "warning.dark", fontWeight: 600 } : undefined}>{money(a.balance)}</Box> : "Nothing due"],
            ["Status", a?.accountStatus != null ? ACCOUNT_STATUS[a.accountStatus] ?? `Code ${a.accountStatus}` : null],
            ["Spent all time", a?.amountSpent != null ? money(a.amountSpent) : null],
            ["Spending limit", a?.spendCap ? money(a.spendCap) : "None"],
          ]}
        />
      )}
    </Section>
  );
}

function EmailStatsSection({ data, since, until }: { data: Data; since: Date; until: Date }) {
  const p = data.profile;
  const { data: st, isLoading } = useQuery({
    queryKey: ["emailStats", p.agent_id, ymd(since), ymd(until)],
    queryFn: () => getEmailStats(p.agent_id, 30, { since, until }),
    staleTime: 60_000,
  });
  const pct = (n: number) => (st && st.sent > 0 ? ` (${Math.round((n / st.sent) * 100)}%)` : "");
  return (
    <Section title="Emails to leads & marketing plan">
      {isLoading ? (
        <Skeleton height={80} />
      ) : !st?.sent ? (
        <Empty>No emails sent in these dates.</Empty>
      ) : (
        <KV
          rows={[
            ["Sent", String(st.sent)],
            ["Opened", `${st.opened}${pct(st.opened)}`],
            ["Opened the plan", `${st.planOpened}${pct(st.planOpened)}`],
            ["Tapped WhatsApp", `${st.clicked}${pct(st.clicked)}`],
            ["Bounced or spam", st.bounced + st.failed + st.spam ? String(st.bounced + st.failed + st.spam) : null],
          ]}
        />
      )}
      <Box sx={{ mt: 1.25 }}>
        <ExtLink href={`/plan/sample/${p.agent_id}`}>See the plan their sellers get</ExtLink>
      </Box>
    </Section>
  );
}

function LandingPagesSection({ data }: { data: Data }) {
  const p = data.profile;
  const { data: pages = [] } = useQuery({
    queryKey: ["clientPages", p.agent_id],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("lead_pages").select("id, name, slug, source_type").eq("agent_id", p.agent_id).order("created_at");
      if (error) throw new Error(error.message);
      return rows as { id: string; name: string; slug: string; source_type: string }[];
    },
  });
  return (
    <Section title="Lead sources" sub={String(pages.length)}>
      {pages.length ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          {pages.map((pg) =>
            pg.source_type === "fb_form" ? (
              <Typography key={pg.id} sx={{ fontSize: 13.5 }}>
                {pg.name} <Box component="span" sx={{ color: tokens.ink3 }}>· Facebook form</Box>
              </Typography>
            ) : (
              <ExtLink key={pg.id} href={`/p/${pg.slug}`}>{pg.name || pg.slug}</ExtLink>
            ),
          )}
        </Box>
      ) : (
        <Empty>No lead sources yet.</Empty>
      )}
    </Section>
  );
}

/* ───────────────────────── settings ───────────────────────── */

/** Their login: the WhatsApp number is the username; a new password can be set
 *  (passwords are encrypted, so the old one can't be shown). */
function LoginSection({ data }: { data: Data }) {
  const p = data.profile;
  const showSnack = useSnack();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (pw.trim().length < 8) return;
    setBusy(true);
    try {
      await setAgentPassword(p.agent_id, pw.trim());
      trackActivity("client_details_edited", { agentId: p.agent_id, detail: "New password set" });
      showSnack(`New password set for ${p.display_name || "this account"}`);
      setOpen(false);
      setPw("");
      setShow(false);
    } catch (e) {
      console.error(e);
      showSnack("Couldn't set the password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Login"
      action={
        <Button size="small" startIcon={<LockResetIcon sx={{ fontSize: "16px !important" }} />} onClick={() => { setOpen((o) => !o); setPw(""); setShow(false); }} sx={{ my: -0.5 }}>
          {open ? "Cancel" : "Set new password"}
        </Button>
      }
    >
      <KV rows={[["Username", p.whatsapp_number || "No number on file"]]} />
      <Typography sx={{ fontSize: 12.5, color: tokens.ink3, mt: 1 }}>
        They log in with their phone number. Passwords are encrypted, so you can't see the old one, only set a new one and send it to them.
      </Typography>
      {open && (
        <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap", alignItems: "flex-start" }}>
          <TextField
            size="small"
            autoFocus
            type={show ? "text" : "password"}
            label="New password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            helperText="At least 8 characters"
            sx={{ flex: 1, minWidth: 200 }}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
                      {show ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <Button variant="contained" disabled={busy || pw.trim().length < 8} onClick={save} sx={{ height: 40 }}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </Box>
      )}
    </Section>
  );
}

function MessagesSection({ data }: { data: Data }) {
  const { profile: p } = data;
  const save = useClientSaver(p.agent_id);
  const [busy, setBusy] = useState(false);
  // Every message to leads (the confirmation email too) is a workflow.
  const { data: workflows } = useQuery({
    queryKey: ["workflows", "account", p.agent_id],
    queryFn: () => listAccountWorkflows(p.agent_id),
  });
  const on = (workflows ?? []).filter((w) => w.published);

  async function toggleAuto(next: boolean) {
    setBusy(true);
    await save(() => updateClientProfile(p.agent_id, { automations_paused: !next }), next ? "Automations switched on" : "Automations paused");
    setBusy(false);
  }

  return (
    <Section title="Messages to leads">
      <Box sx={{ display: "flex", alignItems: "center", ml: -1 }}>
        <Switch checked={!p.automations_paused} disabled={busy} onChange={(e) => toggleAuto(e.target.checked)} />
        <Box>
          <Typography sx={{ fontSize: 13.5 }}>Automations {p.automations_paused ? "paused" : "on"}</Typography>
          <Typography sx={{ fontSize: 12, color: tokens.ink3 }}>Every workflow for this account, emails and WhatsApps</Typography>
        </Box>
      </Box>
      {workflows && (
        <Box sx={{ mt: 1.25, display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography sx={{ fontSize: 12, color: tokens.ink3 }}>
            {on.length ? `${on.length} workflow${on.length === 1 ? "" : "s"} on` : "No workflows on"}
          </Typography>
          {on.map((w) => (
            <Link key={w.id} component={RouterLink} to={`/admin/automations/workflows/${w.id}`} sx={{ fontSize: 13.5 }} underline="hover">
              {w.name}
            </Link>
          ))}
          <Link component={RouterLink} to={`/admin/automations/workflows?account=${p.agent_id}`} sx={{ fontSize: 13.5, mt: 0.5 }} underline="hover">
            All of this account's workflows
          </Link>
        </Box>
      )}
    </Section>
  );
}

function FacebookSection({ data }: { data: Data }) {
  const { profile: p } = data;
  const save = useClientSaver(p.agent_id);
  return (
    <EditableSection
      title="Facebook"
      view={
        <KV
          rows={[
            ["Ad account", p.fb_ad_account_id ? `act_${p.fb_ad_account_id}` : "Not linked"],
            ["Facebook page ID", p.fb_page_id || "Not linked"],
          ]}
        />
      }
      fields={[
        { key: "ad", label: "Facebook ad account ID", value: p.fb_ad_account_id || "", helper: "Numbers only; act_ is added for you" },
        { key: "page", label: "Facebook page ID", value: p.fb_page_id || "" },
      ]}
      onSave={async (v) => {
        const ad = v.ad.replace(/^act_/i, "").replace(/\D/g, "");
        if (v.ad && !ad) return "The ad account ID should be numbers.";
        const page = v.page.replace(/\D/g, "");
        if (v.page && !page) return "The Facebook page ID should be numbers.";
        const ok = await save(() => updateClientProfile(p.agent_id, { fb_ad_account_id: ad, fb_page_id: page }));
        if (!ok) return "Not saved. Try again.";
      }}
    />
  );
}

/** Plan, renewal date and the signed agreement (moved here from the Account page). */
function ContractSection({ data }: { data: Data }) {
  const { profile: p } = data;
  const save = useClientSaver(p.agent_id);
  const showSnack = useSnack();
  const [uploading, setUploading] = useState(false);

  async function onPdf(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) { showSnack("Only PDF files are allowed"); return; }
    if (file.size > 10 * 1024 * 1024) { showSnack("File must be under 10 MB"); return; }
    setUploading(true);
    await save(async () => {
      const path = `${p.agent_id}/contract-${Date.now()}.pdf`;
      const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true, contentType: "application/pdf" });
      if (error) throw error;
      const url = supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
      await updateClientProfile(p.agent_id, { contract_pdf_url: url });
    }, "Contract uploaded");
    setUploading(false);
  }

  return (
    <EditableSection
      title="Contract"
      view={
        <>
          <KV
            rows={[
              ["Plan", p.tier === "paid" ? "Paid" : "Free"],
              ["Renewal date", p.renewal_date ? new Date(p.renewal_date + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : "Not set"],
              ["Agreement", p.contract_pdf_url ? <ExtLink key="pdf" href={p.contract_pdf_url}>View PDF</ExtLink> : "Not uploaded"],
            ]}
          />
          <Button component="label" size="small" variant="outlined" startIcon={uploading ? <CircularProgress size={14} /> : <UploadFileIcon />} disabled={uploading} sx={{ mt: 1.5 }}>
            {p.contract_pdf_url ? "Replace PDF" : "Upload PDF"}
            <input type="file" hidden accept=".pdf,application/pdf" onChange={(e) => { onPdf(e.target.files?.[0]); e.target.value = ""; }} />
          </Button>
        </>
      }
      fields={[{ key: "renewal", label: "Renewal date (YYYY-MM-DD)", value: p.renewal_date || "", placeholder: "e.g. 2026-12-01" }]}
      onSave={async (v) => {
        if (v.renewal && !/^\d{4}-\d{2}-\d{2}$/.test(v.renewal)) return "Use the format YYYY-MM-DD, e.g. 2026-12-01.";
        const ok = await save(() => updateClientProfile(p.agent_id, { renewal_date: v.renewal || null }));
        if (!ok) return "Not saved. Try again.";
      }}
    />
  );
}


const SOURCE_LABEL: Record<BriefSource, string> = {
  call: "added here",
  signup: "sign-up page",
  form: "onboarding form",
  profile: "their account",
};

/** The brief: the same data points for every client (src/lib/brief.ts),
 *  from the sign-up page, the older onboarding form or the onboarding call.
 *  Editing saves under the standard names, which then win. */
function BriefSection({ data }: { data: Data }) {
  const { profile: p, dossier: d } = data;
  const save = useClientSaver(p.agent_id);
  const { data: requests = [] } = useQuery({ queryKey: ["signupRequests"], queryFn: listSignupRequests, staleTime: 5 * 60_000 });
  const wa = digits(p.whatsapp_number || "");
  const signup = requests.find((x) => (wa && digits(x.whatsapp) === wa) || (x.email && p.email && x.email.toLowerCase() === p.email.toLowerCase())) ?? null;
  const onboarding = d?.onboarding ?? [];
  const brief = buildBrief({ signup, onboarding, targetAreas: d?.oldDashboard?.targetAreas ?? [], company: p.company });
  const submitted = onboarding.find((x) => x.q === "Submitted")?.a;
  const sub = signup
    ? `Signed up ${new Date(signup.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`
    : submitted
      ? `Onboarding form ${submitted}`
      : undefined;

  const rowsFor = (part: "signup" | "call") =>
    BRIEF_FIELDS.filter((f) => f.part === part).map((f) => {
      const b = brief[f.key];
      return [
        f.label,
        b ? (
          <Box component="span" key={f.key}>
            {b.value}
            <Box component="span" sx={{ color: tokens.ink3, fontSize: 12 }}> · {SOURCE_LABEL[b.source]}</Box>
          </Box>
        ) : null,
      ] as [string, ReactNode];
    });

  return (
    <EditableSection
      title="Brief"
      sub={sub}
      view={
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <KV labelWidth="42%" rows={rowsFor("signup")} />
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: tokens.ink2, mb: 0.75 }}>From the onboarding call</Typography>
            <KV labelWidth="42%" rows={rowsFor("call")} />
          </Box>
        </Box>
      }
      fields={BRIEF_FIELDS.map((f) => ({ key: f.key, label: f.label, value: brief[f.key]?.value ?? "", placeholder: f.placeholder, multiline: f.key === "suburbs" || f.key === "offer" }))}
      onSave={async (v) => {
        // Keep everything that isn't part of the brief; save the brief under
        // the standard names (old names are dropped, their answer carried over).
        const kept = onboarding.filter((x) => !BRIEF_QUESTIONS.has(x.q));
        const answered = BRIEF_FIELDS.map((f) => ({ q: f.label, a: v[f.key] || "" })).filter((x) => x.a);
        const areas = (v.suburbs || "").split(/[;,\n]/).map((x) => x.trim()).filter(Boolean);
        const ok = await save(() =>
          saveClientDossier(p.agent_id, d, {
            onboarding: [...kept, ...answered],
            oldDashboard: { ...(d?.oldDashboard ?? { joined: null }), targetAreas: areas },
          }),
        );
        if (!ok) return "Not saved. Try again.";
      }}
    />
  );
}

/** Older onboarding-form answers that aren't part of the brief (e.g. whether
 *  they'd send a headshot). Read-only; hidden when there are none. */
function OtherAnswersSection({ data }: { data: Data }) {
  const rows = (data.dossier?.onboarding ?? []).filter((x) => !BRIEF_QUESTIONS.has(x.q) && !SHOWN_ELSEWHERE.has(x.q) && x.a);
  if (!rows.length) return null;
  return (
    <Section title="Other onboarding answers">
      <KV labelWidth="42%" rows={rows.map((x) => [x.q, x.a] as [string, ReactNode])} />
    </Section>
  );
}

function ProfileSection({ data }: { data: Data }) {
  const { profile: p } = data;
  const save = useClientSaver(p.agent_id);
  return (
    <EditableSection
      title="Details"
      view={
        <KV
          rows={[
            ["Name", p.display_name],
            ["Agency", p.company],
            ["Area", p.area],
          ]}
        />
      }
      fields={[
        { key: "name", label: "Name", value: p.display_name || "" },
        { key: "company", label: "Agency", value: p.company || "" },
        { key: "area", label: "Area", value: p.area || "" },
      ]}
      onSave={async (v) => {
        if (!v.name) return "Give the account a name.";
        const ok = await save(() => updateClientProfile(p.agent_id, { display_name: v.name, company: v.company, area: v.area }));
        if (!ok) return "Not saved. Try again.";
      }}
    />
  );
}

function ContactSection({ data }: { data: Data }) {
  const { profile: p, dossier: d } = data;
  const save = useClientSaver(p.agent_id);
  const ob = (q: string) => d?.onboarding.find((x) => x.q === q)?.a || "";
  const login = digits(p.whatsapp_number || "");
  const phones = [...new Set([...(d?.contact.phones ?? []), ob("Phone")].filter(Boolean).map(digits))].filter((x) => x && x !== login);
  const loginEmail = (p.email || "").toLowerCase();
  const emails = [...new Set([...(d?.contact.emails ?? []), ob("Email")].filter(Boolean).map((e) => e.toLowerCase().trim()))].filter(
    (e) => e !== loginEmail && /@/.test(e),
  );
  const s = d?.contact.socials;

  return (
    <EditableSection
      title="Contact"
      view={
        <KV
          rows={[
            ["WhatsApp", p.whatsapp_number],
            ["Other numbers", phones.map((x) => "+" + x).join(", ")],
            ["Lead alerts also go to", (p.alert_contacts ?? []).map(contactText).join(", ")],
            ["Email", p.email],
            ["Other emails", emails.join(", ")],
            ["Contact person", d?.contact.contactPerson],
            ["Team", d?.contact.team],
            ["Facebook", s?.facebook ? <ExtLink key="fb" href={s.facebook}>Page</ExtLink> : null],
            ["Instagram", s?.instagram ? <ExtLink key="ig" href={s.instagram}>Profile</ExtLink> : null],
            ["LinkedIn", s?.linkedin ? <ExtLink key="li" href={s.linkedin}>Profile</ExtLink> : null],
          ]}
        />
      }
      fields={[
        { key: "whatsapp", label: "WhatsApp number", value: p.whatsapp_number || "", helper: "Where their lead alerts go. Their login number doesn't change." },
        {
          key: "alerts",
          label: "Also send lead alerts to",
          value: (p.alert_contacts ?? []).map(contactText).join("; "),
          placeholder: "Stanley 063 152 5310",
          helper: "Name and WhatsApp number. Separate people with ;. They get every lead alert, not the daily summaries.",
        },
        { key: "email", label: "Email", value: p.email || "" },
        { key: "phones", label: "Other numbers", value: phones.map((x) => "+" + x).join("; "), helper: "Separate with ;" },
        { key: "emails", label: "Other emails", value: emails.join("; "), helper: "Separate with ;" },
        { key: "contactPerson", label: "Contact person", value: d?.contact.contactPerson || "" },
        { key: "team", label: "Team", value: d?.contact.team || "" },
        { key: "facebook", label: "Facebook link", value: s?.facebook || "", placeholder: "https://facebook.com/…" },
        { key: "instagram", label: "Instagram link", value: s?.instagram || "", placeholder: "https://instagram.com/…" },
        { key: "linkedin", label: "LinkedIn link", value: s?.linkedin || "", placeholder: "https://linkedin.com/in/…" },
      ]}
      onSave={async (v) => {
        const wa = digits(v.whatsapp);
        if (v.whatsapp && wa.length < 9) return "That WhatsApp number looks too short.";
        if (v.email && !isEmail(v.email)) return "That email address doesn't look right.";
        const otherEmails = splitList(v.emails);
        if (otherEmails.some((e) => !isEmail(e))) return "One of the other emails doesn't look right.";
        const alerts = splitList(v.alerts).map(parseContact);
        if (alerts.some((c) => c.phone.length < 12)) return "One of the lead alert numbers looks too short.";
        const profilePatch: ClientProfilePatch = {};
        const newWa = v.whatsapp ? "+" + wa : "";
        if (newWa !== (p.whatsapp_number || "")) profilePatch.whatsapp_number = newWa;
        if (alerts.map(contactText).join("; ") !== (p.alert_contacts ?? []).map(contactText).join("; ")) profilePatch.alert_contacts = alerts;
        if (v.email !== (p.email || "")) profilePatch.email = v.email;
        const ok = await save(async () => {
          if (Object.keys(profilePatch).length) await updateClientProfile(p.agent_id, profilePatch);
          await saveClientDossier(p.agent_id, d, {
            contact: {
              phones: splitList(v.phones).map((x) => "+" + digits(x)).filter((x) => x.length > 8),
              emails: otherEmails.map((e) => e.toLowerCase()),
              contactPerson: v.contactPerson || null,
              team: v.team || null,
              socials: { facebook: v.facebook || null, instagram: v.instagram || null, linkedin: v.linkedin || null },
            },
          });
        });
        if (!ok) return "Not saved. Try again.";
      }}
    />
  );
}

function BillingSection({ data }: { data: Data }) {
  const { profile: p, dossier: d } = data;
  const save = useClientSaver(p.agent_id);
  const b = d?.billing;
  const plan = d?.package || b?.plan || "";
  const payment = b?.status || d?.audit?.payment || "";
  return (
    <EditableSection
      title="Package & billing"
      view={
        <KV
          rows={[
            ["Package", plan],
            ["Payment status", payment],
            ["Invoice day", b?.invoiceDay],
            ["Last payment", b?.lastPayment],
            ["Next payment", b?.nextPayment],
            ["Billing note", b?.notes],
          ]}
        />
      }
      fields={[
        { key: "plan", label: "Package", value: plan, placeholder: "e.g. R3 000/mo" },
        { key: "status", label: "Payment status", value: payment, placeholder: "e.g. Paid, Overdue, Paused" },
        { key: "invoiceDay", label: "Invoice day", value: b?.invoiceDay || "", placeholder: "e.g. 27th" },
        { key: "lastPayment", label: "Last payment", value: b?.lastPayment || "" },
        { key: "nextPayment", label: "Next payment", value: b?.nextPayment || "" },
        { key: "notes", label: "Billing note", value: b?.notes || "", multiline: true },
      ]}
      onSave={async (v) => {
        const ok = await save(() =>
          saveClientDossier(p.agent_id, d, {
            package: v.plan || null,
            billing: { ...(b ?? {}), plan: v.plan || undefined, status: v.status || undefined, invoiceDay: v.invoiceDay || undefined, lastPayment: v.lastPayment || undefined, nextPayment: v.nextPayment || undefined, notes: v.notes || undefined },
            // The old audit value only filled in a missing status; once edited here, this is the answer.
            audit: d?.audit ? { ...d.audit, payment: v.status || undefined } : null,
          }),
        );
        if (!ok) return "Not saved. Try again.";
      }}
    />
  );
}

function OnboardingSection({ data, which }: { data: Data; which: "onboarding" | "onboardingExtra" }) {
  const { profile: p, dossier: d } = data;
  const save = useClientSaver(p.agent_id);
  const all = (which === "onboarding" ? d?.onboarding : d?.onboardingExtra) ?? [];
  const rows = all.filter((x) => !SHOWN_ELSEWHERE.has(x.q));
  const submitted = all.find((x) => x.q === "Submitted")?.a;
  const extraName = d?.onboardingExtra?.find((x) => x.q === "Full name")?.a;
  const targets = which === "onboarding" ? (d?.oldDashboard?.targetAreas ?? []) : [];
  const title = which === "onboarding" ? "Onboarding form" : extraName ? `${extraName}'s answers` : "Second agent's answers";

  const questions = rows.map((x) => x.q);
  const fields: FieldDef[] = questions.map((q, i) => ({ key: `q${i}`, label: q, value: rows.find((x) => x.q === q)?.a || "", multiline: true }));
  if (which === "onboarding") fields.push({ key: "targets", label: "Target areas", value: targets.join("; "), helper: "Separate with ;" });

  const kv = rows.map((x) => [x.q, x.a] as [string, ReactNode]);
  if (targets.length) kv.push(["Target areas", targets.join(", ")]);

  return (
    <EditableSection
      title={title}
      sub={submitted}
      view={kv.length ? <KV labelWidth="32%" rows={kv} /> : <Empty>They haven't filled in the onboarding form.</Empty>}
      fields={fields}
      onSave={async (v) => {
        // Keep name/email/phone/submitted as they were; replace the rest in order.
        const kept = all.filter((x) => SHOWN_ELSEWHERE.has(x.q));
        const answered = questions.map((q, i) => ({ q, a: v[`q${i}`] || "" })).filter((x) => x.a);
        const changes: Partial<ClientDossier> = { [which]: [...kept, ...answered] };
        if (which === "onboarding") {
          changes.oldDashboard = { ...(d?.oldDashboard ?? { joined: null }), targetAreas: splitList(v.targets) };
        }
        const ok = await save(() => saveClientDossier(p.agent_id, d, changes));
        if (!ok) return "Not saved. Try again.";
      }}
    />
  );
}
