import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppBar, Avatar, Box, Button, CircularProgress, IconButton, Link, Skeleton, Toolbar, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import PhoneIcon from "@mui/icons-material/Phone";
import MailOutlineIcon from "@mui/icons-material/MailOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LoginIcon from "@mui/icons-material/Login";
import { tokens } from "../theme";
import { clientPicture, cplLabel, getClient, getSpend30d, type ClientDossier, type ClientLive, type ClientProfile } from "../api/clients";
import { setActiveAgent } from "../api/_client";
import { useAuth } from "../hooks/useAuth";
import { timeAgo } from "../lib/timeAgo";

/** Digits in international form, so 083… and +2783… compare equal. */
const digits = (s: string) => {
  const d = (s || "").replace(/\D/g, "");
  return d.length === 10 && d.startsWith("0") ? "27" + d.slice(1) : d;
};

// Onboarding answers already shown in Contact or the section header.
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
          <Header profile={data.profile} dossier={data.dossier} />
          <Box sx={{ p: { xs: 1.5, md: 2.5 }, maxWidth: 1200, mx: "auto", display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Kpis profile={data.profile} live={data.live} />

            {/* Two independent columns, so a short card never leaves a gap
                beside a long one. */}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 360px" }, gap: 1.5, alignItems: "start" }}>
              {/* Side column first in the DOM so contact comes first on a phone. */}
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, gridColumn: { md: 2 }, gridRow: { md: 1 }, minWidth: 0 }}>
                <ContactSection profile={data.profile} d={data.dossier} />
                <BillingSection d={data.dossier} />
                <SetupSection profile={data.profile} live={data.live} />
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, gridColumn: { md: 1 }, gridRow: { md: 1 }, minWidth: 0 }}>
                <Section title="Leads by stage">
                  <Bars data={data.live?.by_stage ?? {}} />
                </Section>
                <OnboardingSection d={data.dossier} />
              </Box>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}

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
    <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
      <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, md: 3 }, display: "flex", gap: { xs: 2, md: 3 }, alignItems: { xs: "flex-start", md: "center" }, flexDirection: { xs: "column", md: "row" } }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flex: 1, minWidth: 0 }}>
          <Avatar src={clientPicture(p)} alt={name} sx={{ width: 80, height: 80, fontSize: 30, fontWeight: 600, bgcolor: p.sidebar_color || "#111827" }}>
            {name[0]?.toUpperCase()}
          </Avatar>
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

function Section({ title, children, sub }: { title: string; children: ReactNode; sub?: string }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", minWidth: 0 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: 1 }}>{title}</Typography>
        {sub && <Typography sx={{ fontSize: 11.5, color: tokens.ink3 }}>{sub}</Typography>}
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>{children}</Box>
    </Box>
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

function ContactSection({ profile: p, d }: { profile: ClientProfile; d: ClientDossier | null }) {
  const ob = (q: string) => d?.onboarding.find((x) => x.q === q)?.a || "";
  const login = digits(p.whatsapp_number || "");
  const phones = [...new Set([...(d?.contact.phones ?? []), ob("Phone")].filter(Boolean).map(digits))].filter((x) => x && x !== login);
  const loginEmail = (p.email || "").toLowerCase();
  const emails = [...new Set([...(d?.contact.emails ?? []), ob("Email")].filter(Boolean).map((e) => e.toLowerCase().trim()))].filter(
    (e) => e !== loginEmail && /@/.test(e),
  );
  const s = d?.contact.socials;
  return (
    <Section title="Contact">
      <KV
        rows={[
          ["WhatsApp (login)", p.whatsapp_number],
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
    </Section>
  );
}

function BillingSection({ d }: { d: ClientDossier | null }) {
  return (
    <Section title="Package & billing">
      <KV
        rows={[
          ["Package", d?.package || d?.billing?.plan],
          ["Payment status", d?.billing?.status || d?.audit?.payment],
          ["Invoice day", d?.billing?.invoiceDay],
          ["Last payment", d?.billing?.lastPayment],
          ["Next payment", d?.billing?.nextPayment],
          ["Billing note", d?.billing?.notes],
        ]}
      />
    </Section>
  );
}

function SetupSection({ profile: p, live }: { profile: ClientProfile; live: ClientLive | null }) {
  return (
    <Section title="Setup">
      <KV
        rows={[
          ["Ad account", p.fb_ad_account_id ? `act_${p.fb_ad_account_id}` : "Not linked"],
          ["Facebook page", p.fb_page_id ? "Linked" : "Not linked"],
          ["Lead sources", String(live?.lead_pages ?? 0)],
          ["Automations", p.automations_paused ? "Paused" : "On"],
        ]}
      />
    </Section>
  );
}

function OnboardingSection({ d }: { d: ClientDossier | null }) {
  const rows = (d?.onboarding ?? []).filter((x) => !SHOWN_ELSEWHERE.has(x.q));
  const extra = (d?.onboardingExtra ?? []).filter((x) => !SHOWN_ELSEWHERE.has(x.q));
  const submitted = d?.onboarding.find((x) => x.q === "Submitted")?.a;
  const extraName = d?.onboardingExtra?.find((x) => x.q === "Full name")?.a;
  const targets = d?.oldDashboard?.targetAreas ?? [];
  const kv = (list: { q: string; a: string }[]) => list.map((x) => [x.q, x.a] as [string, ReactNode]);

  return (
    <Section title="Onboarding form" sub={submitted}>
      {rows.length || targets.length ? (
        <KV labelWidth="32%" rows={[...kv(rows), ["Target areas", targets.join(", ")]]} />
      ) : (
        <Empty>They haven't filled in the onboarding form.</Empty>
      )}
      {extra.length > 0 && (
        <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${tokens.divider2}` }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, mb: 1 }}>
            {extraName ? `${extraName}'s answers` : "Second agent's answers"}
          </Typography>
          <KV labelWidth="32%" rows={kv(extra)} />
        </Box>
      )}
    </Section>
  );
}
