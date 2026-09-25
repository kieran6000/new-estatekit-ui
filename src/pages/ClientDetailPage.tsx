import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppBar, Avatar, Box, Button, Card, CardContent, CircularProgress, IconButton, Link, Skeleton, Toolbar, Tooltip, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import PhoneIcon from "@mui/icons-material/Phone";
import MailOutlineIcon from "@mui/icons-material/MailOutlined";
import LoginIcon from "@mui/icons-material/Login";
import FacebookIcon from "@mui/icons-material/Facebook";
import InstagramIcon from "@mui/icons-material/Instagram";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { tokens } from "../theme";
import { clientPicture, cplLabel, getClient, getSpend30d, type ClientDossier, type ClientLive, type ClientProfile } from "../api/clients";
import { setActiveAgent } from "../api/_client";
import { useAuth } from "../hooks/useAuth";
import StageDonut from "../components/StageDonut";
import { timeAgo } from "../lib/timeAgo";
import type { Stage } from "../types";

/** Digits in international form, so 083… and +2783… compare equal. */
const digits = (s: string) => {
  const d = (s || "").replace(/\D/g, "");
  return d.length === 10 && d.startsWith("0") ? "27" + d.slice(1) : d;
};
const prettyPhone = (s: string) => {
  const d = digits(s);
  return d.length === 11 && d.startsWith("27") ? `+27 ${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : s;
};

// Onboarding answers already shown elsewhere on the page.
const SHOWN_ELSEWHERE = new Set(["Full name", "Email", "Phone", "Submitted"]);

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
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Clients</Typography>
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
        <Box sx={{ maxWidth: 1080, mx: "auto", p: { xs: 1.5, md: 3 }, display: "flex", flexDirection: "column", gap: 2 }}>
          <Header profile={data.profile} dossier={data.dossier} />
          <Kpis profile={data.profile} live={data.live} />

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 320px" }, gap: 2, alignItems: "start" }}>
            {/* Aside first in the DOM so contact details come first on a phone. */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, gridColumn: { md: 2 }, gridRow: { md: 1 } }}>
              <ContactCard profile={data.profile} d={data.dossier} />
              <BillingCard d={data.dossier} />
              <SetupCard profile={data.profile} live={data.live} />
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, gridColumn: { md: 1 }, gridRow: { md: 1 }, minWidth: 0 }}>
              <StageDonut
                title="Where their leads are"
                counts={Object.entries(data.live?.by_stage ?? {}).map(([stage, count]) => ({ stage: stage as Stage, count }))}
              />
              <BusinessCard d={data.dossier} />
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

/* ───────────────────────── header + KPIs ───────────────────────── */

function Header({ profile: p, dossier: d }: { profile: ClientProfile; dossier: ClientDossier | null }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const name = p.display_name || p.whatsapp_number || "Unnamed account";
  const phone = p.whatsapp_number || d?.contact.phones[0] || "";
  const email = p.email || d?.contact.emails[0] || "";

  function openDashboard() {
    setActiveAgent(p.agent_id === user?.id ? null : p.agent_id);
    qc.invalidateQueries();
    navigate("/leads");
  }

  return (
    <Box sx={{ display: "flex", gap: 2, alignItems: { xs: "flex-start", sm: "center" }, flexDirection: { xs: "column", sm: "row" }, pt: { xs: 1, md: 0 } }}>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flex: 1, minWidth: 0 }}>
        <Avatar src={clientPicture(p)} alt={name} sx={{ width: 72, height: 72, fontSize: 28, fontWeight: 600, bgcolor: p.sidebar_color || "#111827" }}>
          {name[0]?.toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>{name}</Typography>
          <Typography sx={{ fontSize: 14.5, color: tokens.ink2, mt: 0.5 }}>
            {[p.company, p.area].filter(Boolean).join(" · ") || "No agency on file"}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        {phone && (
          <Tooltip title="WhatsApp">
            <IconButton href={`https://wa.me/${digits(phone)}`} target="_blank" rel="noopener" sx={{ border: `1px solid ${tokens.divider}`, bgcolor: "background.paper" }}>
              <WhatsAppIcon sx={{ fontSize: 20, color: "#1e8e3e" }} />
            </IconButton>
          </Tooltip>
        )}
        {phone && (
          <Tooltip title="Call">
            <IconButton href={`tel:+${digits(phone)}`} sx={{ border: `1px solid ${tokens.divider}`, bgcolor: "background.paper" }}>
              <PhoneIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        )}
        {email && (
          <Tooltip title="Email">
            <IconButton href={`mailto:${email}`} sx={{ border: `1px solid ${tokens.divider}`, bgcolor: "background.paper" }}>
              <MailOutlineIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        )}
        <Button variant="contained" startIcon={<LoginIcon />} onClick={openDashboard} sx={{ ml: { sm: 0.5 } }}>
          Open their dashboard
        </Button>
      </Box>
    </Box>
  );
}

function Kpis({ profile: p, live }: { profile: ClientProfile; live: ClientLive | null }) {
  const leads30 = live?.leads_30d ?? 0;
  const { data: spend, isLoading } = useQuery({
    queryKey: ["spend30d", p.fb_ad_account_id],
    queryFn: () => getSpend30d(p.fb_ad_account_id!),
    enabled: !!p.fb_ad_account_id,
    staleTime: 30 * 60_000,
    retry: false,
  });
  const items: [string, ReactNode][] = [
    ["Leads · 7 days", live?.leads_7d ?? 0],
    ["Leads · 30 days", leads30],
    ["CPL · 30 days", p.fb_ad_account_id && isLoading ? <Skeleton key="s" width={56} /> : cplLabel(spend, leads30)],
    ["Leads · all time", live?.leads_total ?? 0],
    ["Last lead", live?.last_lead_at ? timeAgo(live.last_lead_at) : "never"],
  ];
  return (
    <Card variant="outlined" sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(5, 1fr)" } }}>
      {items.map(([label, value], i) => (
        <Box
          key={label}
          sx={{
            px: 2,
            py: 1.75,
            borderLeft: { sm: i ? `1px solid ${tokens.divider2}` : "none" },
            borderTop: { xs: i > 1 ? `1px solid ${tokens.divider2}` : "none", sm: "none" },
            gridColumn: { xs: i === 4 ? "span 2" : "auto", sm: "auto" },
          }}
        >
          <Typography component="div" sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
          <Typography sx={{ fontSize: 12, color: tokens.ink2, mt: 0.25 }}>{label}</Typography>
        </Box>
      ))}
    </Card>
  );
}

/* ───────────────────────── building blocks ───────────────────────── */

function Panel({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.75, "&:last-child": { pb: 2 } }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1, lineHeight: 1.3 }}>{title}</Typography>
          {sub && <Typography sx={{ fontSize: 12, color: tokens.ink3 }}>{sub}</Typography>}
        </Box>
        {children}
      </CardContent>
    </Card>
  );
}

/** Label above value. Renders nothing for an empty value. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, color: tokens.ink3, lineHeight: 1.4 }}>{label}</Typography>
      <Typography component="div" sx={{ fontSize: 14, color: tokens.ink, lineHeight: 1.45, wordBreak: "break-word" }}>{children}</Typography>
    </Box>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <Typography sx={{ fontSize: 13.5, color: tokens.ink3 }}>{children}</Typography>;
}

/* ───────────────────────── cards ───────────────────────── */

function ContactCard({ profile: p, d }: { profile: ClientProfile; d: ClientDossier | null }) {
  const ob = (q: string) => d?.onboarding.find((x) => x.q === q)?.a || "";
  const login = digits(p.whatsapp_number || "");
  const phones = [...new Set([...(d?.contact.phones ?? []), ob("Phone")].filter(Boolean).map(digits))].filter((x) => x && x !== login);
  const loginEmail = (p.email || "").toLowerCase();
  const emails = [...new Set([...(d?.contact.emails ?? []), ob("Email")].filter(Boolean).map((e) => e.toLowerCase().trim()))].filter(
    (e) => e !== loginEmail && /@/.test(e),
  );
  const s = d?.contact.socials;
  const socials = [
    s?.facebook && { href: s.facebook, icon: <FacebookIcon sx={{ fontSize: 20, color: "#1877f2" }} />, label: "Facebook" },
    s?.instagram && { href: s.instagram, icon: <InstagramIcon sx={{ fontSize: 20, color: "#c13584" }} />, label: "Instagram" },
    s?.linkedin && { href: s.linkedin, icon: <LinkedInIcon sx={{ fontSize: 20, color: "#0a66c2" }} />, label: "LinkedIn" },
  ].filter(Boolean) as { href: string; icon: ReactNode; label: string }[];

  return (
    <Panel title="Contact">
      <Field label="WhatsApp">{p.whatsapp_number ? prettyPhone(p.whatsapp_number) : null}</Field>
      <Field label="Email">{p.email ? <Link href={`mailto:${p.email}`} underline="hover">{p.email}</Link> : null}</Field>
      <Field label={phones.length > 1 ? "Other numbers" : "Other number"}>{phones.map(prettyPhone).join(", ")}</Field>
      <Field label={emails.length > 1 ? "Other emails" : "Other email"}>{emails.join(", ")}</Field>
      <Field label="Contact person">{d?.contact.contactPerson}</Field>
      <Field label="Team">{d?.contact.team}</Field>
      {socials.length > 0 && (
        <Box sx={{ display: "flex", gap: 0.5, ml: -1 }}>
          {socials.map((x) => (
            <Tooltip key={x.label} title={x.label}>
              <IconButton href={x.href} target="_blank" rel="noopener" size="small">{x.icon}</IconButton>
            </Tooltip>
          ))}
        </Box>
      )}
    </Panel>
  );
}

function BillingCard({ d }: { d: ClientDossier | null }) {
  const b = d?.billing;
  const plan = d?.package || b?.plan;
  const payment = b?.status || d?.audit?.payment;
  const any = plan || payment || b?.invoiceDay || b?.lastPayment || b?.nextPayment || b?.notes;
  return (
    <Panel title="Plan & billing">
      {any ? (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.75 }}>
            <Field label="Plan">{plan}</Field>
            <Field label="Payment">{payment}</Field>
            <Field label="Invoice day">{b?.invoiceDay}</Field>
            <Field label="Last payment">{b?.lastPayment}</Field>
            <Field label="Next payment">{b?.nextPayment}</Field>
          </Box>
          <Field label="Note">{b?.notes}</Field>
        </>
      ) : (
        <Empty>No billing details on file.</Empty>
      )}
    </Panel>
  );
}

function SetupCard({ profile: p, live }: { profile: ClientProfile; live: ClientLive | null }) {
  const rows: [boolean, string, string][] = [
    [!!p.fb_ad_account_id, "Ad account", p.fb_ad_account_id ? `act_${p.fb_ad_account_id}` : "Not linked"],
    [!!p.fb_page_id, "Facebook page", p.fb_page_id ? "Linked" : "Not linked"],
    [(live?.lead_pages ?? 0) > 0, "Lead sources", `${live?.lead_pages ?? 0} set up`],
    [!p.automations_paused, "Automations", p.automations_paused ? "Paused" : "On"],
  ];
  return (
    <Panel title="Setup">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        {rows.map(([ok, label, detail]) => (
          <Box key={label} sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
            {ok ? (
              <CheckCircleIcon sx={{ fontSize: 18, color: tokens.green }} />
            ) : (
              <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: tokens.ink3 }} />
            )}
            <Typography sx={{ fontSize: 14, flex: 1 }}>{label}</Typography>
            <Typography sx={{ fontSize: 13, color: tokens.ink2, textAlign: "right" }}>{detail}</Typography>
          </Box>
        ))}
      </Box>
    </Panel>
  );
}

function BusinessCard({ d }: { d: ClientDossier | null }) {
  const rows = (d?.onboarding ?? []).filter((x) => !SHOWN_ELSEWHERE.has(x.q));
  const extra = (d?.onboardingExtra ?? []).filter((x) => !SHOWN_ELSEWHERE.has(x.q));
  const submitted = d?.onboarding.find((x) => x.q === "Submitted")?.a;
  const targets = d?.oldDashboard?.targetAreas ?? [];
  const extraName = d?.onboardingExtra?.find((x) => x.q === "Full name")?.a;

  return (
    <Panel title="About their business" sub={submitted ? `Onboarding form, ${submitted}` : undefined}>
      {rows.length || targets.length ? (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, columnGap: 3, rowGap: 2 }}>
          {rows.map((x) => (
            <Field key={x.q} label={x.q}>{x.a}</Field>
          ))}
          {targets.length > 0 && <Field label="Target areas">{targets.join(", ")}</Field>}
        </Box>
      ) : (
        <Empty>They haven't filled in the onboarding form.</Empty>
      )}
      {extra.length > 0 && (
        <>
          <Box sx={{ borderTop: `1px solid ${tokens.divider2}`, pt: 2 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{extraName ? `${extraName}'s answers` : "Second agent's answers"}</Typography>
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, columnGap: 3, rowGap: 2 }}>
            {extra.map((x) => (
              <Field key={x.q} label={x.q}>{x.a}</Field>
            ))}
          </Box>
        </>
      )}
    </Panel>
  );
}
