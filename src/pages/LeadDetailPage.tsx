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
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import EditLeadContactDialog from "../components/EditLeadContactDialog";
import LeadFormDialog from "../components/LeadFormDialog";
import AddressMapDialog from "../components/AddressMapDialog";
import { tokens } from "../theme";
import { LeadTags } from "../components/LeadTag";
import { leadTags } from "../lib/leadTags";
import { useDatasetByPage } from "../hooks/useLeadPages";
import { getLeadSourceAd, moveLeadToPipeline, setLeadArchived, setCommissionReceived } from "../api/leads";
import { useLeadWithStatus, useUpdateLeadNote, useUpdateLeadStage } from "../hooks/useLeads";
import { useFollowLeadAccount } from "../hooks/useFollowLeadAccount";
import { usePipelines } from "../hooks/usePipelines";
import { getPipelinePublic } from "../api/pipelines";
import { useSnack } from "../hooks/useSnack";
import { PIPELINE_STAGES, stageLabel } from "../types";
import { stageForKind, stepForStage, whenToCall } from "../lib/stageLogic";
import { prettyAnswer, maskPhone, telHref } from "../lib/format";
import { describeAttribution, type AdAttribution } from "../lib/adAttribution";
import { timeAgo, whenLabel } from "../lib/timeAgo";
import { useIsOperator } from "../hooks/useAutomations";
import { useCanSeeFullPhone } from "../hooks/useTier";
import StageMenu from "../components/StageMenu";
import OutcomeSheet from "../components/OutcomeSheet";
import LeadHistory from "../components/LeadHistory";
import { logLeadCall } from "../api/leadEvents";
import type { LeadRow, OutcomeStep, Stage } from "../types";

/** The lead, as its own page (/leads/:id) or in the Leads list's side panel
 *  (leadId + onClose), so agents can go down the list without losing it. */
export default function LeadDetailPage({ leadId, onClose, nav }: {
  leadId?: string;
  onClose?: () => void;
  /** In the panel: step to the previous / next lead in the list. */
  nav?: { label: string; prev?: () => void; next?: () => void };
} = {}) {
  const params = useParams<{ id: string }>();
  const id = leadId ?? params.id;
  const navigate = useNavigate();
  // Loads the lead by id when it isn't in the open account (staff opening
  // another agent's link), then switches to that agent's account.
  const { lead, isLoading: leadLoading } = useLeadWithStatus(id);
  useFollowLeadAccount(lead);
  const { data: pipelines = [] } = usePipelines();
  const { data: isOperator } = useIsOperator();
  const datasetByPage = useDatasetByPage(isOperator === true);
  const canSeeFullPhone = useCanSeeFullPhone();
  const updateNote = useUpdateLeadNote();
  const updateStage = useUpdateLeadStage();
  const showSnack = useSnack();
  const qc = useQueryClient();

  const [note, setNote] = useState(lead?.note ?? "");
  const [saveState, setSaveState] = useState("");
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [stageStep, setStageStep] = useState<{ step: OutcomeStep; stage: Stage } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
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
    if (leadLoading) {
      return (
        <Box sx={{ p: 4 }}>
          <Skeleton width="40%" height={32} />
          <Skeleton width="60%" />
          <Skeleton variant="rounded" height={160} sx={{ mt: 2 }} />
        </Box>
      );
    }
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
          {onClose ? (
            <IconButton onClick={onClose} aria-label="Close"><CloseIcon /></IconButton>
          ) : (
            /* Back to wherever they came from (e.g. Automations), else the lead list. */
            <IconButton onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/leads"))} aria-label="Back">
              <ArrowBackIcon />
            </IconButton>
          )}
          <Typography sx={{ fontSize: 18, fontWeight: 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.name}</Typography>
          {nav && (
            <Box sx={{ display: "flex", alignItems: "center", flex: "none" }}>
              <IconButton onClick={nav.prev} disabled={!nav.prev} aria-label="Previous lead" title="Previous lead"><KeyboardArrowUpIcon /></IconButton>
              <Typography sx={{ fontSize: 13, color: "text.secondary", whiteSpace: "nowrap" }}>{nav.label}</Typography>
              <IconButton onClick={nav.next} disabled={!nav.next} aria-label="Next lead" title="Next lead"><KeyboardArrowDownIcon /></IconButton>
            </Box>
          )}
          {onClose && (
            <IconButton onClick={() => navigate(`/leads/${lead.id}`)} aria-label="Open as a full page" title="Open as a full page">
              <OpenInFullIcon fontSize="small" />
            </IconButton>
          )}
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
           
            href={telHref(lead.phone)}
            onClick={() => {
              logLeadCall(lead.id, lead.agent_id);
              setTimeout(() => setOutcomeOpen(true), 150);
            }}
            sx={{
              flex: 1,
              bgcolor: tokens.greenCall,
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
              "&:hover": { bgcolor: tokens.greenCallHover },
            }}
          >
            <CallIcon fontSize="small" /> Call
          </Box>
        </Box>

        <Section title="Contact" action={<Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => setEditOpen(true)}>Edit</Button>}>
          <Row k="Full name" v={lead.name} />
          <Row k="Phone" v={canSeeFullPhone ? lead.phone : maskPhone(lead.phone)} />
          <Row k="Email" v={lead.email || ""} />
          <Row k="Stage" v={stageLabel(lead.stage, pipelineKind)} />
          <Row k="Received" v={`${new Date(lead.created_at).toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} (${timeAgo(lead.created_at)})`} />
          <Row k="When to call" v={(() => { const w = whenToCall(lead); return w.why ? `${w.when} · ${w.why}` : w.when; })()} />
          {isOperator && leadTags(lead, datasetByPage).length > 0 && (
            <Box sx={{ display: "flex", p: "10px 16px", borderTop: `1px solid ${tokens.divider2}`, gap: 1.5, alignItems: "center" }}>
              <Typography sx={{ color: "text.secondary", fontSize: 13, flex: "0 0 46%" }}>Tags</Typography>
              <Box sx={{ flex: 1, minWidth: 0, display: "flex", gap: 0.5, flexWrap: "wrap" }}><LeadTags lead={lead} /></Box>
            </Box>
          )}
        </Section>

        <Section title="From their form" action={lead.fb_lead_id && lead.source_page_id ? <Button size="small" onClick={() => setFormOpen(true)}>View form</Button> : undefined}>
          {lead.form_answers.map((r, i) => <Row key={i} k={r.q} v={prettyAnswer(r.a)} map={/address/i.test(r.q) && prettyAnswer(r.a).trim().length > 4} agentId={lead.agent_id} />)}
          {!lead.form_answers.length && <Row k="" v="No answers captured." />}
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
                      if (onClose) onClose(); else navigate("/leads");
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

        <Section title="History">
          <LeadHistory leadId={lead.id} />
        </Section>
      </Box>

      <EditLeadContactDialog lead={lead} open={editOpen} onClose={() => setEditOpen(false)} showPhone={canSeeFullPhone} />
      {lead.source_page_id && <LeadFormDialog pageId={lead.source_page_id} open={formOpen} onClose={() => setFormOpen(false)} />}
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
        <Typography sx={{ fontSize: 13, color: received ? tokens.greenDark : "text.secondary" }}>
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
  // Ads Manager links carry numeric ids in the utm fields; those mean nothing
  // to an agent, so only real names are shown.
  const named = (v?: string | null) => (v && !/^\d+$/.test(v.trim()) ? v : "");
  const campaign = named(a.campaign_name) || named(a.utm_campaign);
  const adName = named(a.ad_name) || named(a.utm_content);
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

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ mt: 1.5, mx: 2, borderRadius: "6px" }}>
      <Box sx={{ display: "flex", alignItems: "center", pr: 1 }}>
        <Typography sx={{ flex: 1, fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em", p: "14px 16px 4px" }}>
          {title}
        </Typography>
        {action && <Box sx={{ pt: 1 }}>{action}</Box>}
      </Box>
      {children}
    </Paper>
  );
}

function Row({ k, v, map, agentId }: { k: string; v: string; map?: boolean; agentId?: string }) {
  const [mapOpen, setMapOpen] = useState(false);
  return (
    <Box sx={{ display: "flex", p: "10px 16px", borderTop: `1px solid ${tokens.divider2}`, gap: 1.5, "&:first-of-type": { borderTop: 0 } }}>
      {k && (
        <Typography sx={{ color: "text.secondary", fontSize: 13, flex: "0 0 46%" }}>{k}</Typography>
      )}
      {map ? (
        <>
          <Typography
            component="button"
            type="button"
            onClick={() => setMapOpen(true)}
            sx={{ fontSize: 14, flex: 1, minWidth: 0, overflowWrap: "anywhere", p: 0, border: 0, bgcolor: "transparent", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer", textDecoration: "underline", textDecorationColor: tokens.divider, textUnderlineOffset: 3, "&:hover": { textDecorationColor: "currentColor" } }}
          >
            {v}
          </Typography>
          <AddressMapDialog address={v} agentId={agentId} open={mapOpen} onClose={() => setMapOpen(false)} />
        </>
      ) : (
        <Typography sx={{ fontSize: 14, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{v}</Typography>
      )}
    </Box>
  );
}
