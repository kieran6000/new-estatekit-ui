import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppBar, Box, Chip, CircularProgress, IconButton, Stack, Tab, Tabs, Toolbar, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { tokens } from "../theme";
import {
  DEAL_CLIENT_STAGES,
  DEAL_STAGE_HINT,
  DEAL_STAGE_LABEL,
  DEAL_STAGE_ORDER,
  DEAL_STAGE_TONE,
  showRate,
  type DealStage,
} from "../lib/dealStage";
import { AgencyDealsNotSetUp, listAgencyDeals, type AgencyDeal } from "../api/agencyDeals";
import DealSheet from "../components/DealSheet";

type View = "pipeline" | "followups" | "clients" | "dead";

const TONE_COLOR: Record<string, string> = {
  grey: tokens.ink3,
  blue: tokens.primary,
  amber: tokens.amber,
  green: tokens.green,
  red: tokens.red,
};

function StageDot({ stage }: { stage: DealStage }) {
  return <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: TONE_COLOR[DEAL_STAGE_TONE[stage]], flex: "0 0 auto" }} />;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

function DealCard({ deal, onOpen, showNext }: { deal: AgencyDeal; onOpen: () => void; showNext?: boolean }) {
  const d = daysUntil(deal.next_action_at);
  const overdue = d !== null && d < 0;
  return (
    <Box
      onClick={onOpen}
      sx={{
        p: 1.25,
        borderRadius: 1,
        border: `1px solid ${tokens.divider}`,
        bgcolor: "background.paper",
        cursor: "pointer",
        "&:hover": { borderColor: tokens.outline, bgcolor: tokens.hover },
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14.5, fontWeight: 600 }} noWrap>{deal.name}</Typography>
          <Typography sx={{ fontSize: 12.5, color: tokens.ink3 }} noWrap>
            {[deal.agency, deal.area].filter(Boolean).join(" · ") || deal.phone || "—"}
          </Typography>
        </Box>
        {deal.decision_date && !showNext && (
          <Chip size="small" label={`Decide ${new Date(deal.decision_date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`} sx={{ fontSize: 11, height: 22 }} />
        )}
      </Stack>
      {showNext && deal.next_action_reason && (
        <Stack direction="row" spacing={0.75} sx={{ mt: 0.75, alignItems: "center" }}>
          <Chip
            size="small"
            label={d === null ? "Someday" : overdue ? `${-d}d overdue` : d === 0 ? "Today" : `in ${d}d`}
            sx={{ fontSize: 11, height: 22, bgcolor: overdue ? tokens.redTint : d === 0 ? tokens.amberTint : "transparent", color: overdue ? tokens.red : d === 0 ? tokens.amber : tokens.ink3, border: `1px solid ${tokens.divider}` }}
          />
          <Typography sx={{ fontSize: 12.5, color: tokens.ink2 }} noWrap>{deal.next_action_reason}</Typography>
        </Stack>
      )}
    </Box>
  );
}

export default function SalesPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("pipeline");
  const [open, setOpen] = useState<AgencyDeal | null>(null);

  const { data: deals, isLoading, error } = useQuery({
    queryKey: ["agencyDeals"],
    queryFn: listAgencyDeals,
    staleTime: 30_000,
  });

  const rate = useMemo(() => (deals ? showRate(deals) : null), [deals]);

  const byStage = useMemo(() => {
    const m = new Map<DealStage, AgencyDeal[]>();
    for (const s of DEAL_STAGE_ORDER) m.set(s, []);
    for (const d of deals ?? []) if (m.has(d.stage)) m.get(d.stage)!.push(d);
    return m;
  }, [deals]);

  const followups = useMemo(
    () =>
      (deals ?? [])
        .filter((d) => d.next_action_at && !["signed", "paid", "live", "lost", "churned"].includes(d.stage))
        .sort((a, b) => (a.next_action_at ?? "").localeCompare(b.next_action_at ?? "")),
    [deals],
  );
  const clients = useMemo(() => (deals ?? []).filter((d) => DEAL_CLIENT_STAGES.includes(d.stage)), [deals]);
  const dead = useMemo(() => (deals ?? []).filter((d) => ["lost", "churned", "no_show"].includes(d.stage)), [deals]);

  const notSetUp = error instanceof AgencyDealsNotSetUp;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/clients")} aria-label="Back to accounts"><ArrowBackIcon /></IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500, flex: 1 }}>Sales</Typography>
          {rate && rate.rate !== null && (
            <Chip size="small" label={`Show rate ${Math.round(rate.rate * 100)}% · ${rate.showed}/${rate.booked}`} sx={{ bgcolor: "rgba(255,255,255,0.15)", color: "inherit" }} />
          )}
        </Toolbar>
      </AppBar>

      <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Box sx={{ maxWidth: 1100, mx: "auto" }}>
          <Tabs value={view} onChange={(_e, v) => setView(v)} variant="scrollable" scrollButtons="auto">
            <Tab value="pipeline" label="Pipeline" />
            <Tab value="followups" label={`Follow-ups${followups.length ? ` · ${followups.length}` : ""}`} />
            <Tab value="clients" label={`Clients${clients.length ? ` · ${clients.length}` : ""}`} />
            <Tab value="dead" label="Lost & churned" />
          </Tabs>
        </Box>
      </Box>

      <Box sx={{ p: { xs: 1.5, md: 2.5 }, maxWidth: 1100, mx: "auto" }}>
        {isLoading && <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box>}

        {notSetUp && (
          <Box sx={{ p: 3, textAlign: "center", color: tokens.ink2 }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>The sales pipeline isn't set up yet</Typography>
            <Typography sx={{ fontSize: 14 }}>
              Run the migration <code>20261116_0001_agency_deals.sql</code> to create the deals table, then reload.
            </Typography>
          </Box>
        )}

        {error && !notSetUp && (
          <Typography sx={{ color: tokens.red, py: 4 }}>Couldn't load the deals: {(error as Error).message}</Typography>
        )}

        {deals && view === "pipeline" && (
          <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", pb: 1, alignItems: "flex-start" }}>
            {DEAL_STAGE_ORDER.map((s) => {
              const col = byStage.get(s) ?? [];
              return (
                <Box key={s} sx={{ minWidth: 240, width: 240, flex: "0 0 auto" }}>
                  <Stack direction="row" spacing={1} sx={{ mb: 1, px: 0.5, alignItems: "center" }}>
                    <StageDot stage={s} />
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{DEAL_STAGE_LABEL[s]}</Typography>
                    <Typography sx={{ fontSize: 12, color: tokens.ink3 }}>{col.length}</Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 11.5, color: tokens.ink3, px: 0.5, mb: 1 }}>{DEAL_STAGE_HINT[s]}</Typography>
                  <Stack spacing={1}>
                    {col.map((d) => <DealCard key={d.id} deal={d} onOpen={() => setOpen(d)} />)}
                    {col.length === 0 && <Typography sx={{ fontSize: 12, color: tokens.ink3, px: 0.5 }}>—</Typography>}
                  </Stack>
                </Box>
              );
            })}
          </Box>
        )}

        {deals && view === "followups" && (
          <Stack spacing={1} sx={{ maxWidth: 620 }}>
            {followups.length === 0 && <Typography sx={{ color: tokens.ink3, py: 4, textAlign: "center" }}>No follow-ups scheduled. Add a next action on a deal.</Typography>}
            {followups.map((d) => <DealCard key={d.id} deal={d} onOpen={() => setOpen(d)} showNext />)}
          </Stack>
        )}

        {deals && view === "clients" && (
          <Stack spacing={1} sx={{ maxWidth: 620 }}>
            {clients.length === 0 && <Typography sx={{ color: tokens.ink3, py: 4, textAlign: "center" }}>No signed clients in the pipeline yet.</Typography>}
            {clients.map((d) => <DealCard key={d.id} deal={d} onOpen={() => setOpen(d)} />)}
          </Stack>
        )}

        {deals && view === "dead" && (
          <Stack spacing={1} sx={{ maxWidth: 620 }}>
            {dead.length === 0 && <Typography sx={{ color: tokens.ink3, py: 4, textAlign: "center" }}>Nothing lost or churned.</Typography>}
            {dead.map((d) => (
              <Box key={d.id} onClick={() => setOpen(d)} sx={{ p: 1.25, borderRadius: 1, border: `1px solid ${tokens.divider}`, bgcolor: "background.paper", cursor: "pointer", "&:hover": { bgcolor: tokens.hover } }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <StageDot stage={d.stage} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14.5, fontWeight: 600 }} noWrap>{d.name}</Typography>
                    {d.lost_reason && <Typography sx={{ fontSize: 12.5, color: tokens.ink3 }} noWrap>{d.lost_reason}</Typography>}
                  </Box>
                  <Chip size="small" label={DEAL_STAGE_LABEL[d.stage]} sx={{ fontSize: 11, height: 22 }} />
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <DealSheet deal={open} onClose={() => setOpen(null)} />
    </Box>
  );
}
