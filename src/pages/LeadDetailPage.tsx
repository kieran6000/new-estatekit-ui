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
import { getLeadSourceAd, moveLeadToPipeline, setLeadArchived } from "../api/leads";
import { useLead, useUpdateLeadNote, useUpdateLeadStage } from "../hooks/useLeads";
import { usePipelines } from "../hooks/usePipelines";
import { useSnack } from "../hooks/useSnack";
import { PIPELINE_STAGES } from "../types";
import { pipelineKindFor, STEP_FOR_STAGE } from "../lib/stageLogic";
import { prettyAnswer, maskPhone } from "../lib/format";
import { timeAgo } from "../lib/timeAgo";
import { useIsOperator } from "../hooks/useAutomations";
import StageMenu from "../components/StageMenu";
import OutcomeSheet from "../components/OutcomeSheet";
import type { OutcomeStep, Stage } from "../types";

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const lead = useLead(id);
  const { data: pipelines = [] } = usePipelines();
  const { data: isOperator } = useIsOperator();
  const updateNote = useUpdateLeadNote();
  const updateStage = useUpdateLeadStage();
  const showSnack = useSnack();
  const qc = useQueryClient();

  const [note, setNote] = useState(lead?.note ?? "");
  const [saveState, setSaveState] = useState("");
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [stageStep, setStageStep] = useState<{ step: OutcomeStep; stage: Stage } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  const pipelineKind = pipelineKindFor(lead, pipelines);
  const stagesForPipeline = PIPELINE_STAGES[pipelineKind];

  function handleStagePick(stage: Stage) {
    const step = STEP_FOR_STAGE[stage];
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
          <IconButton onClick={() => navigate("/leads")}>
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>{lead.name}</Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 720, mx: "auto", pb: 3 }}>
        <Box sx={{ display: "flex", gap: 1.25, m: "14px 16px 0" }}>
          <StageMenu current={lead.stage} stages={stagesForPipeline} onPick={handleStagePick}>
            {(open) => (
              <Box
                component="button"
                onClick={open}
                sx={{
                  flex: 1,
                  bgcolor: "#fff",
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
            href={`tel:${lead.phone.replace(/\s/g, "")}`}
            onClick={() => setTimeout(() => setOutcomeOpen(true), 150)}
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
          <Row k="Phone" v={isOperator ? lead.phone : maskPhone(lead.phone)} />
          <Row k="Email" v={lead.email || ""} />
          <Row k="Stage" v={lead.stage} />
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

        {/* The ad that produced this lead, resolved from its Facebook lead id. */}
        <SourceAdSection leadId={lead.id} />

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
                    moveLeadToPipeline(lead.id, pid)
                      .then(() => {
                        qc.invalidateQueries({ queryKey: ["leads"] });
                        showSnack(`Moved to ${pipelines.find((p) => p.id === pid)?.name ?? "pipeline"}`);
                      })
                      .catch((err) => showSnack(err.message));
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
                    .catch((err) => showSnack(err.message));
                }}
                sx={{ textTransform: "none", alignSelf: "flex-start" }}
              >
                Archive this lead
              </Button>
            </Box>
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
function SourceAdSection({ leadId }: { leadId: string }) {
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
  if (!ad) return null;

  return (
    <Section title="Came from this ad">
      {ad.imageUrl && (
        <Box
          component="img"
          src={ad.imageUrl}
          alt={ad.headline || ad.name}
          loading="lazy"
          sx={{ width: "calc(100% - 32px)", mx: 2, mt: 1, borderRadius: "6px", display: "block", border: `1px solid ${tokens.divider}` }}
        />
      )}
      <Box sx={{ p: "10px 16px 14px", display: "flex", flexDirection: "column", gap: 0.5 }}>
        {ad.headline && <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>{ad.headline}</Typography>}
        {ad.body && (
          <Typography sx={{ fontSize: 13, color: "text.secondary", whiteSpace: "pre-line", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {ad.body}
          </Typography>
        )}
        <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.5 }}>
          {ad.name}{ad.status ? ` · ${ad.status.toLowerCase().replace(/_/g, " ")}` : ""}
        </Typography>
        {ad.postUrl && (
          <Typography
            component="a"
            href={ad.postUrl}
            target="_blank"
            rel="noopener"
            sx={{ fontSize: 13, color: tokens.primaryDark, textDecoration: "none", mt: 0.5, width: "fit-content" }}
          >
            View this ad on Facebook ›
          </Typography>
        )}
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
