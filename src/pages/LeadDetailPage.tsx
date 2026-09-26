import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AppBar, Box, Button, FormControl, IconButton, InputLabel, MenuItem,
  Paper, Select, Skeleton, TextField, Toolbar, Typography,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CallIcon from "@mui/icons-material/Call";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import { tokens } from "../theme";
import { getLeadSourceAd, moveLeadToPipeline, setLeadArchived, setCommissionReceived } from "../api/leads";
import { useLead, useUpdateLeadNote, useUpdateLeadStage } from "../hooks/useLeads";
import { usePipelines } from "../hooks/usePipelines";
import { getPipelinePublic } from "../api/pipelines";
import { useSnack } from "../hooks/useSnack";
import { PIPELINE_STAGES, stageLabel } from "../types";
import { stageForKind, stepForStage } from "../lib/stageLogic";
import { prettyAnswer, maskPhone } from "../lib/format";
import { describeAttribution, type AdAttribution } from "../lib/adAttribution";
import { timeAgo, whenLabel } from "../lib/timeAgo";
import { useIsOperator } from "../hooks/useAutomations";
import { useCanSeeFullPhone } from "../hooks/useTier";
import StageMenu from "../components/StageMenu";
import OutcomeSheet from "../components/OutcomeSheet";
import LeadHistory from "../components/LeadHistory";
import { logLeadCall } from "../api/leadEvents";
import type { LeadRow, OutcomeStep, Stage } from "../types";
import { useFocusFromUrl } from "../lib/spotlight";

export default function LeadDetailPage() {
  useFocusFromUrl();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const lead = useLead(id);
  const { data: pipelines = [] } = usePipelines();
  const { data: isOperator } = useIsOperator();
  const canSeeFullPhone = useCanSeeFullPhone();
  const updateNote = useUpdateLeadNote();
  const updateStage = useUpdateLeadStage();
  const showSnack = useSnack();
  const qc = useQueryClient();

  const [note, setNote] = useState(lead?.note ?? "");
  const [saveState, setSaveState] = useState("");
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [stageStep, setStageStep] = useState<{ step: OutcomeStep; stage: Stage } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Fetched only when the lead's pipeline isn't among the ones we loaded.
  // Declared before the early return so hook order stays stable.
  const inList = pipelines.some((p) => p.id === lead?.pipeline_id);
  const { data: leadPipeline } = useQuery({
    queryKey: ["pipelinePublic", lead?.pipeline_id],
    queryFn: () => getPipelinePublic(lead!.pipeline_id),
    enabled: !!lead?.pipeline_id && !inList,
    staleTime: 60 * 60_000,
    retry: false,
  });

  useEffect(() => setNote(lead?.note ?? ""), [lead?.id]);

  if (!lead) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">Lead not found.</Typography>
      </Box>
    );
  }

  function saveNote(value: string) {
    setSaveState("Saving…");
    updateNote.mutate(
      { id: lead!.id, note: value },
      {
        onSuccess: () => setSaveState("Saved"),
        onError: () => setSaveState("Save failed"),
      },
    );
  }

  function onNoteChange(value: string) {
    setNote(value);
    setSaveState("Saving…");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveNote(value), 500);
  }

  // Same rule as the action page: if the lead's pipeline isn't in the loaded
  // list (e.g. an operator viewing another agent's lead) fetch it rather than
  // silently defaulting to seller stages.
  const matchedKind = pipelines.find((p) => p.id === lead.pipeline_id)?.kind;
  const pipelineKind = matchedKind ?? leadPipeline?.kind ?? "seller";
  const stagesForPipeline = PIPELINE_STAGES[pipelineKind];

  function handleStagePick(stage: Stage) {
    const step = stepForStage(stage, pipelineKind);
    if (step) {
      setStageStep({ step, stage });
      return;
    }
    const prev = { stage: lead!.stage, next_label: lead!.next_label, due: lead!.due, reminder_at: lead!.reminder_at, commission: lead!.commission };
    updateStage.mutate({ id: lead!.id, stage });
    showSnack(`${lead!.name.split(" ")[0]} moved to ${stage}`, () =>
      updateStage.mutate({ id: lead!.id, stage: prev.stage, override: prev }),
    );
  }

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          {/* Back to wherever they came from (e.g. Automations), else the lead list. */}
          <IconButton onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/leads"))}>
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>{lead.name}</Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 720, mx: "auto", pb: 3 }}>
        <Box sx={{ display: "flex", gap: 1.25, m: "14px 16px 0" }}>
          <StageMenu current={lead.stage} stages={stagesForPipeline} kind={pipelineKind} onPick={handleStagePick}>
            {(open) => (
              <Box
                component="button"
                onClick={open}
                sx={{
                  flex: 1,
                  bgcolor: tokens.surface,
                  color: tokens.primary,
                  border: `1px solid ${tokens.divider}`,
                  borderRadius: "4px",
                  p: "14px",
                  fontWeight: 500,
                  fontSize: 14,
                  textTransform: "uppercase",
                  cursor: "pointer",
                  "&:hover": { bgcolor: tokens.primaryBg },
                }}
              >
                Change stage
              </Box>
            )}
          </StageMenu>
          <Box
            component="a"
            data-focus="call"
            href={`tel:${lead.phone.replace(/\s/g, "")}`}
            onClick={() => {
              logLeadCall(lead.id, lead.agent_id);
              setTimeout(() => setOutcomeOpen(true), 150);
            }}
            sx={{
              flex: 1,
              bgcolor: tokens.green,
              color: "#fff",
              borderRadius: "4px",
              p: "14px",
              fontWeight: 500,
              fontSize: 14,
              textTransform: "uppercase",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              textDecoration: "none",
              "&:hover": { bgcolor: tokens.greenDark },
            }}
          >
            <CallIcon fontSize="small" /> Call
          </Box>
        </Box>

        <Section title="Contact">
          <Row k="Phone" v={canSeeFullPhone ? lead.phone : maskPhone(lead.phone)} />
          <Row k="Email" v={lead.email || ""} />
          <Row k="Stage" v={stageLabel(lead.stage, pipelineKind)} />
          <Row k="Received" v={timeAgo(lead.created_at)} />
          <Row k="Next" v={lead.next_label} />
        </Section>

        <Section title="From their form">
          {lead.form_answers.length ? (
            lead.form_answers.map((r, i) => <Row key={i} k={r.q} v={prettyAnswer(r.a)} />)
          ) : (
            <Row k="" v="No answers captured." />
          )}
        </Section>

        <Section title="Notes">
          <TextField
            multiline
            minRows={4}
            fullWidth
            placeholder="Add a note about this lead…"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            onBlur={() => saveNote(note)}
            sx={{ mx: 2, mt: 1, mb: 0.5, width: "calc(100% - 32px)" }}
          />
          <Typography variant="caption" sx={{ color: "text.disabled", px: 2, pb: 1.75, display: "block", height: 18 }}>
            {saveState}
          </Typography>
        </Section>

        {/* Only once there's money to talk about. Until someone ticks this the
            commission is expected, not earned — see useOverview. */}
        {!!lead.commission && (
          <Section title="Commission">
            <CommissionRow lead={lead} />
          </Section>
        )}

        {/* The ad that produced this lead, resolved from its Facebook lead id.
            Falls back to the captured landing-page attribution when there's no
            readable ad — a website lead used to show nothing at all here. */}
        <SourceAdSection leadId={lead.id} lead={lead} />

        {isOperator && (
          <Section title="Admin">
            <Box sx={{ p: "12px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="move-pipeline">Pipeline</InputLabel>
                <Select
                  labelId="move-pipeline"
                  label="Pipeline"
                  value={lead.pipeline_id ?? ""}
                  onChange={(e) => {
                    const pid = e.target.value as string;
                    if (!pid || pid === lead.pipeline_id) return;
                    const target = pipelines.find((p) => p.id === pid);
                    // Translate the stage if the new pipeline is a different kind,
                    // so its "what happened?" options still apply to this lead.
                    const mapped = target ? stageForKind(lead.stage as Stage, target.kind) : undefined;
                    const changed = mapped && mapped !== lead.stage ? mapped : undefined;
                    moveLeadToPipeline(lead.id, pid, changed)
                      .then(() => {
                        qc.invalidateQueries({ queryKey: ["leads"] });
                        qc.invalidateQueries({ queryKey: ["leadEvents"] });
                        showSnack(
                          changed
                            ? `Moved to ${target?.name ?? "pipeline"} · stage is now ${changed}`
                            : `Moved to ${target?.name ?? "pipeline"}`,
                        );
                      })
                      .catch((err) => { console.error(err); showSnack("That didn't save. Try again."); });
                  }}
                >
                  {pipelines.map((p) => (
                    <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button
                variant="outlined"
                color="inherit"
                startIcon={<ArchiveOutlinedIcon />}
                onClick={() => {
                  setLeadArchived(lead.id, true)
                    .then(() => {
                      qc.invalidateQueries({ queryKey: ["leads"] });
                      showSnack(`${lead.name.split(" ")[0]} archived`, () => {
                        setLeadArchived(lead.id, false).then(() =>
                          qc.invalidateQueries({ queryKey: ["leads"] }),
                        );
                      });
                      navigate("/leads");
                    })
                    .catch((err) => { console.error(err); showSnack("That didn't save. Try again."); });
                }}
                sx={{ textTransform: "none", alignSelf: "flex-start" }}
              >
                Archive this lead
              </Button>
            </Box>
          </Section>
        )}

        {isOperator && (
          <Section title="History">
            <LeadHistory leadId={lead.id} />
          </Section>
        )}
      </Box>

      <OutcomeSheet lead={lead} pipelineKind={pipelineKind} open={outcomeOpen} onClose={() => setOutcomeOpen(false)} onSnack={showSnack} />
      <OutcomeSheet
        lead={lead}
        pipelineKind={pipelineKind}
        open={!!stageStep}
        entryStep={stageStep?.step ?? "main"}
        entryStage={stageStep?.stage}
        onClose={() => setStageStep(null)}
        onSnack={showSnack}
      />
    </Box>
  );
}

/** Shows the Facebook ad this lead clicked, when there is one. Website leads and
 *  ads we can't read simply render nothing rather than an empty shell. */
/**
 * Expected vs received, and the one tick that moves it between them.
 *
 * Deliberately not automatic off a stage: a mandate can be signed months
 * before the property transfers, and only the agent knows when the money
 * actually landed.
 */
function CommissionRow({ lead }: { lead: LeadRow }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [busy, setBusy] = useState(false);
  const received = !!lead.commission_received_at;

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      await setCommissionReceived(lead.id, next);
      await qc.invalidateQueries({ queryKey: ["leads"] });
      await qc.invalidateQueries({ queryKey: ["overview"] });
      showSnack(next ? "Marked as received" : "Back to expected");
    } catch (e) {
      console.error(e);
      showSnack("That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ p: "12px 16px", display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          R{(lead.commission ?? 0).toLocaleString("en-ZA")}
        </Typography>
        <Typography sx={{ fontSize: 13, color: received ? "#1b5e20" : "text.secondary" }}>
          {received
            ? `Received ${whenLabel(lead.commission_received_at).replace(/ at .*/, "")}`
            : "Expected — not received yet"}
        </Typography>
      </Box>
      <Button
        variant={received ? "outlined" : "contained"}
        size="small"
        disabled={busy}
        onClick={() => toggle(!received)}
        sx={{ textTransform: "none", whiteSpace: "nowrap" }}
      >
        {received ? "Undo" : "Mark as received"}
      </Button>
    </Box>
  );
}

/**
 * What we know about where a lead came from when there's no ad to show —
 * website leads, or a Facebook ad we can't read. Renders nothing at all rather
 * than an empty "Source: Direct" shell when nothing was captured.
 */
function SourceFallback({ lead }: { lead: LeadRow }) {
  const a = (lead.attribution ?? {}) as AdAttribution;
  const label = describeAttribution(a);
  const campaign = a.campaign_name || a.utm_campaign;
  const adName = a.ad_name || a.utm_content;
  const hasAnything = Object.keys(a).length > 0;
  if (!hasAnything && !lead.source_page_id) return null;

  return (
    <Section title="Came from">
      <Box sx={{ p: "10px 16px 14px", display: "flex", flexDirection: "column", gap: 0.35 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{label}</Typography>
        {campaign && (
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Campaign: {campaign}</Typography>
        )}
        {adName && (
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Ad: {adName}</Typography>
        )}
        {!hasAnything && (
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
            Filled in your lead page. No campaign details were tagged on the link.
          </Typography>
        )}
      </Box>
    </Section>
  );
}

function SourceAdSection({ leadId, lead }: { leadId: string; lead: LeadRow }) {
  const { data: ad, isLoading } = useQuery({
    queryKey: ["leadSourceAd", leadId],
    queryFn: () => getLeadSourceAd(leadId),
    staleTime: 30 * 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <Section title="Came from this ad">
        <Box sx={{ p: "12px 16px" }}>
          <Skeleton variant="rounded" animation="wave" height={180} sx={{ borderRadius: "6px" }} />
        </Box>
      </Section>
    );
  }
  // No readable ad: show whatever the landing page captured instead. Agents
  // kept asking where a website lead came from and the answer was nowhere.
  if (!ad) return <SourceFallback lead={lead} />;

  // Compact: a small thumbnail beside the copy, not a full-width hero image —
  // this block sits among the lead's details and shouldn't dominate the screen.
  return (
    <Section title="Came from this ad">
      <Box sx={{ display: "flex", gap: 1.25, p: "10px 16px 14px", alignItems: "flex-start" }}>
        {ad.imageUrl && (
          <Box
            component="img"
            src={ad.imageUrl}
            alt={ad.headline || ad.name}
            loading="lazy"
            sx={{ width: 64, height: 64, flex: "0 0 auto", objectFit: "cover", borderRadius: "6px", border: `1px solid ${tokens.divider}` }}
          />
        )}
        <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 0.25 }}>
          {ad.headline && (
            <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {ad.headline}
            </Typography>
          )}
          {ad.body && (
            <Typography sx={{ fontSize: 12.5, color: "text.secondary", whiteSpace: "pre-line", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {ad.body}
            </Typography>
          )}
          <Typography sx={{ fontSize: 11.5, color: "text.disabled" }}>
            {ad.name}{ad.status ? ` · ${ad.status.toLowerCase().replace(/_/g, " ")}` : ""}
          </Typography>
          {ad.postUrl && (
            <Typography
              component="a"
              href={ad.postUrl}
              target="_blank"
              rel="noopener"
              sx={{ fontSize: 12.5, color: tokens.primaryDark, textDecoration: "none", width: "fit-content" }}
            >
              View on Facebook ›
            </Typography>
          )}
        </Box>
      </Box>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ mt: 1.5, mx: 2, borderRadius: "6px" }}>
      <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em", p: "14px 16px 4px" }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <Box sx={{ display: "flex", p: "10px 16px", borderTop: `1px solid ${tokens.divider2}`, gap: 1.5, "&:first-of-type": { borderTop: 0 } }}>
      {k && (
        <Typography sx={{ color: "text.secondary", fontSize: 13, flex: "0 0 46%" }}>{k}</Typography>
      )}
      <Typography sx={{ fontSize: 14, flex: 1 }}>{v}</Typography>
    </Box>
  );
}
