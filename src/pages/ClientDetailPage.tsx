import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  AppBar,
  Avatar,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Link,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Toolbar,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import PhoneIcon from "@mui/icons-material/Phone";
import MailOutlineIcon from "@mui/icons-material/MailOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LoginIcon from "@mui/icons-material/Login";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import { tokens } from "../theme";
import { clientPicture, getClient, type ClientDossier, type ClientFeedback, type ClientLive, type ClientProfile } from "../api/clients";
import { setActiveAgent } from "../api/_client";
import { useAuth } from "../hooks/useAuth";
import ClientStatusChip, { TONE } from "../components/ClientStatusChip";
import ActiveAds from "../components/ActiveAds";
import { timeAgo } from "../lib/timeAgo";

type TabKey = "overview" | "profile" | "ads" | "calls" | "feedback" | "history" | "docs";

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? s + "T12:00:00" : s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
};
const digits = (s: string) => s.replace(/\D/g, "");

export default function ClientDetailPage() {
  const { agentId = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["client", agentId], queryFn: () => getClient(agentId), enabled: !!agentId });
  const [tab, setTab] = useState<TabKey>(() => {
    try { return (sessionStorage.getItem("estatekit_client_tab") as TabKey) || "overview"; } catch { return "overview"; }
  });
  useEffect(() => { try { sessionStorage.setItem("estatekit_client_tab", tab); } catch { /* ignore */ } }, [tab]);

  const title = data?.profile.display_name || "Client";

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/admin/clients")} aria-label="Back to clients">
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</Typography>
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
          <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, position: "sticky", top: 56, zIndex: 2 }}>
            <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ maxWidth: 1200, mx: "auto", px: { xs: 0, md: 2 } }}>
              <Tab value="overview" label="Overview" />
              <Tab value="profile" label="Profile & onboarding" />
              <Tab value="ads" label="Ads" />
              <Tab value="calls" label={`Calls & notes${data.dossier?.calls.length ? ` · ${data.dossier.calls.length}` : ""}`} />
              <Tab value="feedback" label={`Feedback${data.dossier?.feedback.length ? ` · ${data.dossier.feedback.length}` : ""}`} />
              <Tab value="history" label="Old dashboard" />
              <Tab value="docs" label={`Docs${data.dossier?.docs.length ? ` · ${data.dossier.docs.length}` : ""}`} />
            </Tabs>
          </Box>
          <Box sx={{ p: { xs: 1.5, md: 2.5 }, maxWidth: 1200, mx: "auto" }}>
            {tab === "overview" && <OverviewTab profile={data.profile} live={data.live} d={data.dossier} goTo={setTab} />}
            {tab === "profile" && <ProfileTab profile={data.profile} d={data.dossier} />}
            {tab === "ads" && <AdsTab profile={data.profile} d={data.dossier} />}
            {tab === "calls" && <CallsTab d={data.dossier} />}
            {tab === "feedback" && <FeedbackTab d={data.dossier} />}
            {tab === "history" && <HistoryTab d={data.dossier} />}
            {tab === "docs" && <DocsTab d={data.dossier} updatedAt={data.dossierUpdatedAt} />}
          </Box>
        </>
      )}
    </Box>
  );
}

/* ───────────────────────── header ───────────────────────── */

function Header({ profile: p, dossier: d }: { profile: ClientProfile; dossier: ClientDossier | null }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const name = p.display_name || p.whatsapp_number || "Unnamed account";
  const switchedOff = !p.onboarded && p.automations_paused;
  const status = d?.status ?? (switchedOff ? { label: "Switched off", tone: "grey" as const } : { label: "Onboarding", tone: "blue" as const });
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
            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 1 }}>
              <ClientStatusChip label={status.label} tone={status.tone} size="md" />
              {d?.health && <ClientStatusChip label={`Health: ${d.health}`} tone={d.health === "Satisfied" ? "green" : d.health === "Priority" ? "red" : "amber"} size="md" />}
              {switchedOff && status.label !== "Switched off" && <ClientStatusChip label="Account switched off" tone="grey" size="md" />}
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button variant="contained" startIcon={<LoginIcon />} onClick={openDashboard}>Open their dashboard</Button>
          {phone && (
            <Button variant="outlined" startIcon={<WhatsAppIcon />} href={`https://wa.me/${digits(phone)}`} target="_blank" rel="noopener">WhatsApp</Button>
          )}
          {phone && <Button variant="outlined" startIcon={<PhoneIcon />} href={`tel:+${digits(phone)}`}>Call</Button>}
          {email && <Button variant="outlined" startIcon={<MailOutlineIcon />} href={`mailto:${email}`}>Email</Button>}
          {p.fb_ad_account_id && (
            <Button variant="outlined" startIcon={<OpenInNewIcon />} href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${p.fb_ad_account_id}`} target="_blank" rel="noopener">
              Ads Manager
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/* ───────────────────────── building blocks ───────────────────────── */

function Section({ title, children, action, sub }: { title: string; children: ReactNode; action?: ReactNode; sub?: string }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", minWidth: 0 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: 1 }}>{title}</Typography>
        {sub && <Typography sx={{ fontSize: 11.5, color: tokens.ink3 }}>{sub}</Typography>}
        {action}
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>{children}</Box>
    </Box>
  );
}

function Grid({ children, min = 340 }: { children: ReactNode; min?: number }) {
  return <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: `repeat(auto-fit, minmax(${min}px, 1fr))` }, gap: 1.5, alignItems: "start" }}>{children}</Box>;
}

function KV({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false);
  if (!shown.length) return <Empty>Nothing on file.</Empty>;
  return (
    <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "minmax(110px, 38%) 1fr", columnGap: 1.5, rowGap: 0.875 }}>
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

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", px: 2, py: 1.5 }}>
      <Typography sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{value}</Typography>
      <Typography sx={{ fontSize: 12, color: tokens.ink2, mt: 0.25 }}>{label}</Typography>
      {hint && <Typography sx={{ fontSize: 11, color: tokens.ink3 }}>{hint}</Typography>}
    </Box>
  );
}

function Bars({ data, total }: { data: Record<string, number>; total?: number }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <Empty>No leads yet.</Empty>;
  const max = total ?? Math.max(...entries.map(([, n]) => n));
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      {entries.map(([k, n]) => (
        <Box key={k}>
          <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span>{k}</span>
            <Box component="span" sx={{ color: tokens.ink2, fontVariantNumeric: "tabular-nums" }}>
              {n}{total ? ` · ${Math.round((n / total) * 100)}%` : ""}
            </Box>
          </Box>
          <Box sx={{ height: 6, bgcolor: tokens.surface2, borderRadius: 3, mt: 0.375, overflow: "hidden" }}>
            <Box sx={{ height: "100%", width: `${Math.max(2, (n / (max || 1)) * 100)}%`, bgcolor: "rgba(0,0,0,.45)", borderRadius: 3 }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return <Empty>Nothing listed.</Empty>;
  return (
    <Box component="ul" sx={{ m: 0, pl: 2.25, display: "flex", flexDirection: "column", gap: 0.5 }}>
      {items.map((t, i) => (
        <Box component="li" key={i} sx={{ fontSize: 13.5, lineHeight: 1.45 }}>{t}</Box>
      ))}
    </Box>
  );
}

function Quote({ children, by }: { children: ReactNode; by?: string }) {
  return (
    <Box sx={{ borderLeft: `3px solid ${tokens.divider}`, pl: 1.5, py: 0.25 }}>
      <Typography sx={{ fontSize: 13.5, lineHeight: 1.5, fontStyle: "italic", color: tokens.ink }}>“{children}”</Typography>
      {by && <Typography sx={{ fontSize: 12, color: tokens.ink3, mt: 0.5 }}>{by}</Typography>}
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

function NoDossier() {
  return (
    <Section title="No notes yet">
      <Empty>Nothing from the sheets, call notes or old dashboard is linked to this account.</Empty>
    </Section>
  );
}

/* ───────────────────────── overview ───────────────────────── */

function OverviewTab({ profile: p, live, d, goTo }: { profile: ClientProfile; live: ClientLive | null; d: ClientDossier | null; goTo: (t: TabKey) => void }) {
  const lastCall = d?.calls[0];
  const lastFb = d?.feedback[0];
  const stageTotal = live ? Object.values(live.by_stage).reduce((a, b) => a + b, 0) : 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(6, 1fr)" }, gap: 1.5 }}>
        <Metric label="Leads · 7 days" value={live?.leads_7d ?? 0} />
        <Metric label="Leads · 30 days" value={live?.leads_30d ?? 0} />
        <Metric label="Leads · all time" value={live?.leads_total ?? 0} hint="on this dashboard" />
        <Metric label="Last lead" value={live?.last_lead_at ? timeAgo(live.last_lead_at) : "never"} />
        <Metric label="Lead pages" value={live?.lead_pages ?? 0} />
        <Metric label="Old dashboard leads" value={d?.oldDashboard?.leadsTotal ?? "—"} hint={d?.oldDashboard?.lastLead ? `last ${fmtDate(d.oldDashboard.lastLead)}` : undefined} />
      </Box>

      <Grid>
        <Section title="What needs doing">
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {d?.nextAction && (
              <Box sx={{ bgcolor: TONE[d.status.tone].bg, color: TONE[d.status.tone].fg, borderRadius: "6px", px: 1.5, py: 1, fontSize: 13.5, fontWeight: 500 }}>
                {d.nextAction}
              </Box>
            )}
            {d?.todos.length ? (
              <Box>
                <Typography sx={{ fontSize: 12, color: tokens.ink3, mb: 0.5 }}>To-dos (Metrics sheet)</Typography>
                <Bullets items={d.todos} />
              </Box>
            ) : null}
            {lastCall && lastCall.actions.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: 12, color: tokens.ink3, mb: 0.5 }}>Actions from the last call ({fmtDate(lastCall.date)})</Typography>
                <Bullets items={lastCall.actions} />
              </Box>
            )}
            {d?.exclusiveAreas && (
              <Box>
                <Typography sx={{ fontSize: 12, color: tokens.ink3, mb: 0.5 }}>Exclusive farming areas (agreed)</Typography>
                <Typography sx={{ fontSize: 13.5 }}>{d.exclusiveAreas.join(", ")}</Typography>
              </Box>
            )}
            {!d?.nextAction && !d?.todos.length && !lastCall?.actions.length && <Empty>Nothing outstanding on file.</Empty>}
          </Box>
        </Section>

        <Section title="Package & billing">
          <KV
            rows={[
              ["Package", d?.package],
              ["Plan (Metrics)", d?.billing?.plan],
              ["Payment status", d?.billing?.status || d?.audit?.payment],
              ["Invoice day", d?.billing?.invoiceDay],
              ["Last payment", d?.billing?.lastPayment],
              ["Next payment", d?.billing?.nextPayment],
              ["Billing note", d?.billing?.notes],
              ["Target CPL", d?.targetCpl],
              ["Dashboard tier", p.tier],
              ["Automations", p.automations_paused ? "Paused" : "On"],
              ["Onboarded here", p.onboarded ? "Yes" : "No"],
            ]}
          />
        </Section>

        <Section title="Health" sub={d?.audit ? "audit: 19 Aug 2026" : undefined}>
          <KV
            rows={[
              ["Health (Metrics)", d?.health],
              ["Audit status", d?.audit?.status],
              ["Sentiment", d?.audit?.sentiment],
              ["Health score", d?.audit ? `${d.audit.healthScore} / 3 (lower is healthier)` : null],
              ["Leads 30d (audit)", d?.audit?.leads30d],
              ["Booked all-time", d?.audit?.bookedAllTime],
              ["Funnel live", d?.audit?.funnelLive],
              ["WhatsApp OK", d?.audit?.whatsappOk],
              ["Sept check-ins", d?.septTracker ? `${d.septTracker.forms} forms · ${d.septTracker.calls} calls` : null],
            ]}
          />
          {d?.audit?.notes && (
            <Typography sx={{ fontSize: 13, color: tokens.ink2, mt: 1.5, lineHeight: 1.5 }}>{d.audit.notes}</Typography>
          )}
        </Section>

        <Section title="Leads by stage" sub="live">
          <Bars data={live?.by_stage ?? {}} total={stageTotal || undefined} />
        </Section>

        {(d?.clientMessage || lastFb) && (
          <Section title="In their words" action={lastFb ? <Button size="small" onClick={() => goTo("feedback")}>All feedback</Button> : undefined}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {lastFb && <ScoreRow f={lastFb} />}
              {lastFb?.comment && <Quote by={`Weekly check-in, ${fmtDate(lastFb.date)}`}>{lastFb.comment}</Quote>}
              {d?.clientMessage && <Quote by="Message to Kieran">{d.clientMessage}</Quote>}
            </Box>
          </Section>
        )}

        {lastCall && (
          <Section title="Last call" sub={fmtDate(lastCall.date)} action={<Button size="small" onClick={() => goTo("calls")}>All calls</Button>}>
            <Typography sx={{ fontSize: 13.5, lineHeight: 1.5 }}>{lastCall.summary || firstTakeaways(lastCall).join(" ") || lastCall.title}</Typography>
            {lastCall.recording && (
              <Box sx={{ mt: 1 }}>
                <ExtLink href={lastCall.recording}>Watch recording</ExtLink>
              </Box>
            )}
          </Section>
        )}
      </Grid>

      {!d && <NoDossier />}
    </Box>
  );
}

function firstTakeaways(c: ClientDossier["calls"][number]): string[] {
  const s = c.sections.find((x) => /takeaway/i.test(x.title));
  return (s?.items ?? []).filter((i) => i.depth === 0).slice(0, 2).map((i) => i.text);
}

/* ───────────────────────── profile ───────────────────────── */

function ProfileTab({ profile: p, d }: { profile: ClientProfile; d: ClientDossier | null }) {
  const s = d?.contact.socials;
  return (
    <Grid>
      <Section title="Contact">
        <KV
          rows={[
            ["WhatsApp (login)", p.whatsapp_number],
            ["Other numbers", d?.contact.phones.filter((x) => digits(x) !== digits(p.whatsapp_number || "")).join(", ")],
            ["Email", p.email],
            ["Other emails", d?.contact.emails.filter((x) => x !== (p.email || "").toLowerCase()).join(", ")],
            ["Contact person", d?.contact.contactPerson],
            ["Team", d?.contact.team],
            ["Facebook", s?.facebook ? <ExtLink key="fb" href={s.facebook}>Page</ExtLink> : null],
            ["Instagram", s?.instagram ? <ExtLink key="ig" href={s.instagram}>Profile</ExtLink> : null],
            ["LinkedIn", s?.linkedin ? <ExtLink key="li" href={s.linkedin}>Profile</ExtLink> : null],
          ]}
        />
      </Section>

      <Section title="On this dashboard">
        <KV
          rows={[
            ["Agency", p.company],
            ["Area", p.area],
            ["Ad account", p.fb_ad_account_id ? `act_${p.fb_ad_account_id}` : "Not linked"],
            ["Facebook page ID", p.fb_page_id || "Not linked"],
            ["Tier", p.tier],
            ["Onboarded", p.onboarded ? "Yes" : "No"],
            ["Automations", p.automations_paused ? "Paused" : "On"],
            ["Account ID", <Box key="id" component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>{p.agent_id}</Box>],
          ]}
        />
      </Section>

      <Section title="Onboarding form" sub={d?.onboarding.find((x) => x.q === "Submitted")?.a}>
        {d?.onboarding.length ? <KV rows={d.onboarding.filter((x) => x.q !== "Submitted").map((x) => [x.q, x.a] as [string, ReactNode])} /> : <Empty>They haven't filled in the onboarding form.</Empty>}
      </Section>

      {d?.onboardingExtra && (
        <Section title="Onboarding form (second agent)" sub={d.onboardingExtra.find((x) => x.q === "Submitted")?.a}>
          <KV rows={d.onboardingExtra.filter((x) => x.q !== "Submitted").map((x) => [x.q, x.a] as [string, ReactNode])} />
        </Section>
      )}
    </Grid>
  );
}

/* ───────────────────────── ads ───────────────────────── */

const AD_STATUS_TONE: Record<string, "green" | "grey" | "red" | "amber"> = {
  ACTIVE: "green",
  PAUSED: "grey",
  ADSET_PAUSED: "grey",
  CAMPAIGN_PAUSED: "grey",
  ARCHIVED: "grey",
  DISAPPROVED: "red",
  WITH_ISSUES: "amber",
};
const adStatusLabel = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function AdsTab({ profile: p, d }: { profile: ClientProfile; d: ClientDossier | null }) {
  const [since] = useState(() => new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10));
  const h = d?.hub;
  const t = d?.adTotals;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Grid>
        <Section title="Client Hub" sub={h ? `updated ${h.updated}` : undefined}>
          {h ? (
            <KV
              rows={[
                ["Status", h.status],
                ["Next", h.next],
                ["Ad account", h.adAccount],
                ["In the Hub", h.active ? "Active" : "Paused"],
                ["Active ads", h.activeAds],
                ["Spend (period)", h.spend],
                ["Leads (period)", h.leads],
                ["Avg CPL", h.avgCpl],
                ["Lead forms", h.forms],
              ]}
            />
          ) : (
            <Empty>Not in the Client Hub.</Empty>
          )}
        </Section>

        <Section title="Ad history totals" sub="CSM KPI report">
          {t ? (
            <KV
              rows={[
                ["Ads on record", `${t.count} (${t.active} active)`],
                ["Total spend", `R ${t.spend.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`],
                ["Results", t.results],
                ["Blended CPL", t.cpl != null ? `R ${t.cpl.toFixed(2)}` : "—"],
                ["Cheapest ad", t.bestAd],
                ["Target CPL", d?.targetCpl],
              ]}
            />
          ) : (
            <Empty>No ad history on record.</Empty>
          )}
          {d?.adAccountInfo && (
            <Box sx={{ mt: 1.5 }}>
              <KV rows={Object.entries(d.adAccountInfo).map(([k, v]) => [k.replace(/([A-Z])/g, " $1").replace(/^\w/, (c) => c.toUpperCase()), v] as [string, ReactNode])} />
            </Box>
          )}
        </Section>
      </Grid>

      {d?.ads.length ? (
        <Section title="Every ad on record" sub="spend and results are lifetime per ad">
          <Box sx={{ overflowX: "auto", mx: -2 }}>
            <Table size="small" sx={{ minWidth: 760, "& td, & th": { fontSize: 12.5, whiteSpace: "nowrap" } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Ad</TableCell>
                  <TableCell>Ad set</TableCell>
                  <TableCell>Campaign</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Spend</TableCell>
                  <TableCell align="right">Results</TableCell>
                  <TableCell align="right">CPL</TableCell>
                  <TableCell>Started</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {d.ads.map((a, i) => (
                  <TableRow key={i} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{a.ad}</TableCell>
                    <TableCell>{a.adSet}</TableCell>
                    <TableCell>{a.campaign}</TableCell>
                    <TableCell><ClientStatusChip label={adStatusLabel(a.status)} tone={AD_STATUS_TONE[a.status] ?? "grey"} /></TableCell>
                    <TableCell align="right">{a.spend}</TableCell>
                    <TableCell align="right">{a.results}</TableCell>
                    <TableCell align="right">{a.cpl}</TableCell>
                    <TableCell>{fmtDate(a.start)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Section>
      ) : null}

      <Section title="Live from Meta · last 30 days">
        {p.fb_ad_account_id ? (
          <Box sx={{ mx: -2, mb: -2 }}>
            <ActiveAds adAccountId={p.fb_ad_account_id} agentName={p.company || p.display_name || undefined} agentId={p.agent_id} since={since} />
          </Box>
        ) : (
          <Empty>No ad account linked to this account.</Empty>
        )}
      </Section>
    </Box>
  );
}

/* ───────────────────────── calls ───────────────────────── */

function CallsTab({ d }: { d: ClientDossier | null }) {
  if (!d?.calls.length) return <Section title="Calls & notes"><Empty>No calls on record.</Empty></Section>;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {d.calls.map((c, i) => (
        <Accordion key={i} defaultExpanded={i === 0} disableGutters variant="outlined" sx={{ borderRadius: "8px !important", "&:before": { display: "none" } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>
                {fmtDate(c.date)}
                <Box component="span" sx={{ fontWeight: 400, color: tokens.ink2 }}> · {c.title || "Check-in call"}</Box>
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: tokens.ink3, mt: 0.25 }}>
                {[c.ledBy && `Led by ${c.ledBy}`, c.duration, c.status && `Status: ${c.status}`, c.next && `Next check-in: ${c.next}`].filter(Boolean).join(" · ")}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            {c.recording && (
              <Box>
                <Button size="small" variant="outlined" startIcon={<PlayCircleOutlineIcon />} href={c.recording} target="_blank" rel="noopener">
                  Watch recording
                </Button>
              </Box>
            )}
            {c.summary && (
              <Box>
                <Label>Summary</Label>
                <Typography sx={{ fontSize: 13.5, lineHeight: 1.55 }}>{c.summary}</Typography>
              </Box>
            )}
            {c.actions.length > 0 && (
              <Box>
                <Label>Actions agreed</Label>
                <Bullets items={c.actions} />
              </Box>
            )}
            {c.sections.map((s, j) => (
              <Box key={j}>
                <Label>{s.title}</Label>
                <NoteItems items={s.items} />
              </Box>
            ))}
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <Typography sx={{ fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink3, mb: 0.5 }}>{children}</Typography>;
}

function NoteItems({ items }: { items: { text: string; depth: number }[] }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      {items.map((it, i) =>
        it.depth < 0 ? (
          <Typography key={i} sx={{ fontSize: 13.5, fontWeight: 600, mt: i ? 1 : 0 }}>{it.text}</Typography>
        ) : (
          <Box key={i} sx={{ display: "flex", gap: 1, pl: it.depth ? 2.5 : 0 }}>
            <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: it.depth ? tokens.ink3 : tokens.ink2, mt: "8px", flexShrink: 0 }} />
            <Typography sx={{ fontSize: 13.5, lineHeight: 1.5 }}>{it.text}</Typography>
          </Box>
        ),
      )}
    </Box>
  );
}

/* ───────────────────────── feedback ───────────────────────── */

const SCORE_KEYS: [keyof ClientFeedback, string][] = [
  ["leadQuality", "Lead quality"],
  ["leadVolume", "Lead volume"],
  ["followUp", "Follow-up"],
  ["confidence", "Confidence to list"],
  ["happiness", "Happy with us"],
];
const scoreTone = (n: number) => (n >= 4 ? TONE.green : n === 3 ? TONE.amber : TONE.red);

function ScoreRow({ f }: { f: ClientFeedback }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0.75 }}>
      {SCORE_KEYS.map(([k, label]) => {
        const n = f[k] as number;
        const t = scoreTone(n);
        return (
          <Box key={k} sx={{ bgcolor: t.bg, color: t.fg, borderRadius: "6px", px: 0.75, py: 0.75, textAlign: "center" }}>
            <Typography sx={{ fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>{n}</Typography>
            <Typography sx={{ fontSize: 10.5, lineHeight: 1.2, mt: 0.25 }}>{label}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function FeedbackTab({ d }: { d: ClientDossier | null }) {
  if (!d?.feedback.length) return <Section title="Weekly feedback"><Empty>They haven't sent a weekly check-in form yet.</Empty></Section>;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Typography sx={{ fontSize: 13, color: tokens.ink2 }}>Scores out of 5 from the weekly check-in form. Green is 4–5, amber 3, red 1–2.</Typography>
      {d.feedback.map((f, i) => (
        <Section key={i} title={fmtDate(f.date)} action={f.risk ? <ClientStatusChip label={`Risk: ${f.risk}`} tone={f.risk === "RED" ? "red" : f.risk === "AMBER" ? "amber" : "green"} /> : undefined}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
            <ScoreRow f={f} />
            {f.comment && <Quote>{f.comment}</Quote>}
            {f.weak && <Typography sx={{ fontSize: 12.5, color: tokens.ink2 }}>Weakest areas: {f.weak}</Typography>}
          </Box>
        </Section>
      ))}
    </Box>
  );
}

/* ───────────────────────── old dashboard ───────────────────────── */

function HistoryTab({ d }: { d: ClientDossier | null }) {
  const o = d?.oldDashboard;
  if (!o) return <Section title="Old dashboard"><Empty>This client wasn't on the old dashboard.</Empty></Section>;
  const statusTotal = Object.values(o.byStatus).reduce((a, b) => a + b, 0);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Typography sx={{ fontSize: 13, color: tokens.ink2 }}>A read-only snapshot of their account on the old EstateKit dashboard. Their old leads were not copied over.</Typography>
      <Grid>
        <Section title="Account">
          <KV
            rows={[
              ["Name there", o.name],
              ["Title", o.title],
              ["Company", o.companyName],
              ["Location", o.location],
              ["Subdomain", o.subdomain],
              ["Joined", fmtDate(o.joined)],
              ["Last seen", fmtDate(o.lastSeen)],
              ["First lead", fmtDate(o.firstLead)],
              ["Last lead", fmtDate(o.lastLead)],
              ["Total leads", o.leadsTotal],
              ["Lead types", Object.entries(o.byType).map(([k, n]) => `${k} ${n}`).join(", ")],
              ["State", o.disabled ? `Disabled${o.disabledAt ? ` ${fmtDate(o.disabledAt)}` : ""}` : o.hidden ? "Hidden" : "Active"],
            ]}
          />
        </Section>

        <Section title="Where their leads ended up">
          <Bars data={o.byStatus} total={statusTotal || undefined} />
        </Section>

        <Section title="Funnels">
          {o.funnels.length ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              {o.funnels.map((f, i) => (
                <Box key={i} sx={{ display: "flex", justifyContent: "space-between", gap: 1, fontSize: 13.5 }}>
                  <span>{f.name}</span>
                  <Box component="span" sx={{ color: tokens.ink3, whiteSpace: "nowrap" }}>{f.type} · {f.published ? "published" : "draft"} · {fmtDate(f.created)}</Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Empty>No funnels.</Empty>
          )}
        </Section>

        <Section title="Facebook lead forms">
          {o.fbForms.length ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              {o.fbForms.map((f, i) => (
                <Box key={i} sx={{ fontSize: 13.5 }}>
                  {f.label || "Unnamed form"}
                  <Box component="span" sx={{ color: tokens.ink3 }}> · {f.lead_type} · {String(f.enabled) === "true" ? "on" : "off"} · {f.form_id}</Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Empty>No forms linked.</Empty>
          )}
        </Section>

        {o.targetAreas.length > 0 && (
          <Section title="Target areas">
            <Typography sx={{ fontSize: 13.5 }}>{o.targetAreas.join(", ")}</Typography>
          </Section>
        )}

        {o.csmBoard?.map((b, i) => (
          <Section key={i} title="CSM board">
            <KV
              rows={[
                ["Stage", b.stage],
                ["Area", b.area],
                ["Live since", fmtDate(b.liveSince)],
                ["Check-in due", fmtDate(b.checkinDue)],
                ["Review due", fmtDate(b.reviewDue)],
                ["Leads (board)", String(b.stats?.leads ?? "")],
                ["Spend (board)", b.stats?.spend != null ? `R ${Number(b.stats.spend).toFixed(2)}` : null],
                ["CPL (board)", b.stats?.cpl != null ? `R ${Number(b.stats.cpl).toFixed(2)}` : null],
              ]}
            />
          </Section>
        ))}
      </Grid>
    </Box>
  );
}

/* ───────────────────────── docs ───────────────────────── */

function DocsTab({ d, updatedAt }: { d: ClientDossier | null; updatedAt: string | null }) {
  return (
    <Grid>
      <Section title="Documents & sheets">
        {d?.docs.length ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {d.docs.map((x, i) => (
              <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                <DescriptionOutlinedIcon sx={{ fontSize: 18, color: tokens.ink3, mt: "2px" }} />
                <ExtLink href={x.url}>{x.title}</ExtLink>
              </Box>
            ))}
          </Box>
        ) : (
          <Empty>No documents linked to this client.</Empty>
        )}
      </Section>
      <Section title="Where this page's information comes from">
        {d?.sources.length ? <Bullets items={d.sources} /> : <Empty>Only this dashboard.</Empty>}
        <Typography sx={{ fontSize: 12, color: tokens.ink3, mt: 1.5 }}>
          Compiled {fmtDate(d?.generatedAt)}{updatedAt ? `, saved ${timeAgo(updatedAt)}` : ""}. Lead numbers at the top of Overview are live.
        </Typography>
      </Section>
    </Grid>
  );
}
