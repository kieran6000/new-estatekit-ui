import { useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Link,
  Skeleton,
  Switch,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import PhoneIcon from "@mui/icons-material/Phone";
import MailOutlineIcon from "@mui/icons-material/MailOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LoginIcon from "@mui/icons-material/Login";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import { tokens } from "../theme";
import {
  clientPicture,
  cplLabel,
  getClient,
  getSpend30d,
  saveClientDossier,
  updateClientProfile,
  uploadClientPhoto,
  type ClientDossier,
  type ClientLive,
  type ClientProfile,
  type ClientProfilePatch,
} from "../api/clients";
import { setActiveAgent } from "../api/_client";
import { useAuth } from "../hooks/useAuth";
import { useSnack } from "../hooks/useSnack";
import { timeAgo } from "../lib/timeAgo";

/** Digits in international form, so 083… and +2783… compare equal. */
const digits = (s: string) => {
  const d = (s || "").replace(/\D/g, "");
  return d.length === 10 && d.startsWith("0") ? "27" + d.slice(1) : d;
};
// Lists are typed with ";" between items, the same as form answer options.
const splitList = (s: string) => s.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Onboarding answers already shown in Contact or the section header.
const SHOWN_ELSEWHERE = new Set(["Full name", "Email", "Phone", "Submitted"]);
// Offered when editing, so a client who never filled the form can be filled in.
const STANDARD_QUESTIONS = [
  "Brokerage / agency",
  "Campaign type",
  "Top areas to target",
  "Average price range",
  "Website",
  "Business address",
  "Special offer to leverage",
  "Deals closed in past 6 months",
];

type Data = Awaited<ReturnType<typeof getClient>>;

export default function ClientDetailPage() {
  const { agentId = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["client", agentId], queryFn: () => getClient(agentId), enabled: !!agentId });

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/admin/clients")} aria-label="Back to clients">
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {data?.profile.display_name || "Client"}
          </Typography>
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
            {(error as Error)?.message === "not_found" ? "This account doesn't exist any more." : "Couldn't load this client."}
          </Typography>
          <Typography sx={{ color: tokens.ink2, mt: 0.5, fontSize: 14 }}>Go back to Clients and pick them again, or refresh the page.</Typography>
        </Box>
      )}

      {data && (
        <>
          <Header data={data} />
          <Box sx={{ p: { xs: 1.5, md: 2.5 }, maxWidth: 1200, mx: "auto", display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Kpis profile={data.profile} live={data.live} />

            {/* Two independent columns, so a short card never leaves a gap
                beside a long one. */}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 380px" }, gap: 1.5, alignItems: "start" }}>
              {/* Side column first in the DOM so contact comes first on a phone. */}
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, gridColumn: { md: 2 }, gridRow: { md: 1 }, minWidth: 0 }}>
                <ContactSection data={data} />
                <BillingSection data={data} />
                <AccountSection data={data} />
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, gridColumn: { md: 1 }, gridRow: { md: 1 }, minWidth: 0 }}>
                <Section title="Leads by stage">
                  <Bars data={data.live?.by_stage ?? {}} />
                </Section>
                <OnboardingSection data={data} which="onboarding" />
                {data.dossier?.onboardingExtra && <OnboardingSection data={data} which="onboardingExtra" />}
              </Box>
            </Box>
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
  const showSnack = useSnack();
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
    if (file.size > 2 * 1024 * 1024) { showSnack("Image must be under 2 MB"); return; }
    setUploading(true);
    await save(async () => {
      const url = await uploadClientPhoto(user.id, file);
      await updateClientProfile(p.agent_id, { avatar_url: url });
    }, "Photo updated");
    setUploading(false);
  }

  return (
    <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
      <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, md: 3 }, display: "flex", gap: { xs: 2, md: 3 }, alignItems: { xs: "flex-start", md: "center" }, flexDirection: { xs: "column", md: "row" } }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flex: 1, minWidth: 0 }}>
          <Box
            component="button"
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Change photo"
            sx={{ position: "relative", p: 0, border: 0, bgcolor: "transparent", borderRadius: "50%", cursor: "pointer", flexShrink: 0, "&:hover .cam, &:focus-visible .cam": { opacity: 1 } }}
          >
            <Avatar src={clientPicture(p)} alt={name} sx={{ width: 80, height: 80, fontSize: 30, fontWeight: 600, bgcolor: p.sidebar_color || "#111827" }}>
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
            <Typography sx={{ fontSize: 14.5, color: tokens.ink2, mt: 0.25 }}>{p.company || "No agency on file"}</Typography>
            {p.area && <Typography sx={{ fontSize: 13, color: tokens.ink3, mt: 0.25 }}>{p.area}</Typography>}
          </Box>
        </Box>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button variant="contained" startIcon={<LoginIcon />} onClick={openDashboard}>Open their dashboard</Button>
          {phone && (
            <Button variant="outlined" startIcon={<WhatsAppIcon />} href={`https://wa.me/${digits(phone)}`} target="_blank" rel="noopener">WhatsApp</Button>
          )}
          {phone && <Button variant="outlined" startIcon={<PhoneIcon />} href={`tel:+${digits(phone)}`}>Call</Button>}
          {email && <Button variant="outlined" startIcon={<MailOutlineIcon />} href={`mailto:${email}`}>Email</Button>}
        </Box>
      </Box>
    </Box>
  );
}

/* ───────────────────────── building blocks ───────────────────────── */

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

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", px: 2, py: 1.5 }}>
      <Typography component="div" sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{value}</Typography>
      <Typography sx={{ fontSize: 12, color: tokens.ink2, mt: 0.25 }}>{label}</Typography>
    </Box>
  );
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
            <Box sx={{ height: "100%", width: `${Math.max(2, (n / total) * 100)}%`, bgcolor: "rgba(0,0,0,.45)", borderRadius: 3 }} />
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

/* ───────────────────────── sections ───────────────────────── */

function Kpis({ profile: p, live }: { profile: ClientProfile; live: ClientLive | null }) {
  const leads30 = live?.leads_30d ?? 0;
  const { data: spend, isLoading } = useQuery({
    queryKey: ["spend30d", p.fb_ad_account_id],
    queryFn: () => getSpend30d(p.fb_ad_account_id!),
    enabled: !!p.fb_ad_account_id,
    staleTime: 30 * 60_000,
    retry: false,
  });
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(6, 1fr)" }, gap: 1.5 }}>
      <Metric label="Leads · 7 days" value={live?.leads_7d ?? 0} />
      <Metric label="Leads · 30 days" value={leads30} />
      <Metric label="CPL · 30 days" value={p.fb_ad_account_id && isLoading ? <Skeleton width={60} /> : cplLabel(spend, leads30)} />
      <Metric label="Leads · all time" value={live?.leads_total ?? 0} />
      <Metric label="Last lead" value={live?.last_lead_at ? timeAgo(live.last_lead_at) : "never"} />
      <Metric label="Lead sources" value={live?.lead_pages ?? 0} />
    </Box>
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
        const profilePatch: ClientProfilePatch = {};
        const newWa = v.whatsapp ? "+" + wa : "";
        if (newWa !== (p.whatsapp_number || "")) profilePatch.whatsapp_number = newWa;
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

function AccountSection({ data }: { data: Data }) {
  const { profile: p } = data;
  const save = useClientSaver(p.agent_id);
  const [togglingAuto, setTogglingAuto] = useState(false);

  async function toggleAutomations(on: boolean) {
    setTogglingAuto(true);
    await save(() => updateClientProfile(p.agent_id, { automations_paused: !on }), on ? "Automations switched on" : "Automations paused");
    setTogglingAuto(false);
  }

  return (
    <EditableSection
      title="Account"
      view={
        <>
          <KV
            rows={[
              ["Name", p.display_name],
              ["Agency", p.company],
              ["Area", p.area],
              ["Ad account", p.fb_ad_account_id ? `act_${p.fb_ad_account_id}` : "Not linked"],
              ["Facebook page ID", p.fb_page_id || "Not linked"],
              ["Lead sources", String(data.live?.lead_pages ?? 0)],
            ]}
          />
          <Box sx={{ display: "flex", alignItems: "center", mt: 1, ml: -1 }}>
            <Switch checked={!p.automations_paused} disabled={togglingAuto} onChange={(e) => toggleAutomations(e.target.checked)} />
            <Box>
              <Typography sx={{ fontSize: 13.5 }}>Automations {p.automations_paused ? "paused" : "on"}</Typography>
              <Typography sx={{ fontSize: 12, color: tokens.ink3 }}>Follow-up WhatsApps to this client's leads</Typography>
            </Box>
          </Box>
        </>
      }
      fields={[
        { key: "name", label: "Name", value: p.display_name || "" },
        { key: "company", label: "Agency", value: p.company || "" },
        { key: "area", label: "Area", value: p.area || "" },
        { key: "ad", label: "Facebook ad account ID", value: p.fb_ad_account_id || "", helper: "Numbers only; act_ is added for you" },
        { key: "page", label: "Facebook page ID", value: p.fb_page_id || "" },
      ]}
      onSave={async (v) => {
        if (!v.name) return "Give the account a name.";
        const ad = v.ad.replace(/^act_/i, "").replace(/\D/g, "");
        if (v.ad && !ad) return "The ad account ID should be numbers.";
        const page = v.page.replace(/\D/g, "");
        if (v.page && !page) return "The Facebook page ID should be numbers.";
        const ok = await save(() =>
          updateClientProfile(p.agent_id, { display_name: v.name, company: v.company, area: v.area, fb_ad_account_id: ad, fb_page_id: page }),
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

  // Existing answers plus any standard question they skipped.
  const questions = [...rows.map((x) => x.q), ...(which === "onboarding" ? STANDARD_QUESTIONS.filter((q) => !rows.some((x) => x.q === q)) : [])];
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
