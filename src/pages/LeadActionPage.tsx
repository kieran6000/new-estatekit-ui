import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Box, Paper, Skeleton, TextField, Typography } from "@mui/material";
import CallIcon from "@mui/icons-material/Call";
import { tokens } from "../theme";
import { useLeadWithStatus, useUpdateLeadNote, useUpdateLeadStage } from "../hooks/useLeads";
import { usePipelines } from "../hooks/usePipelines";
import { useLeadPages } from "../hooks/useLeadPages";
import { useSnack } from "../hooks/useSnack";
import { PIPELINE_STAGES } from "../types";
import { pipelineKindFor, STEP_FOR_STAGE } from "../lib/stageLogic";
import StageMenu from "../components/StageMenu";
import OutcomeSheet from "../components/OutcomeSheet";
import type { OutcomeStep, Stage } from "../types";

/**
 * The page a WhatsApp lead-action link (see AdminAutomationsPage) opens —
 * a one-tap way to update one specific lead's stage after a call. Public: no
 * login, no AppShell nav, and not linked from anywhere in the dashboard —
 * reachable only by its own URL (an agent gets there from a WhatsApp tap).
 * Deliberately the same call → outcome-popup flow as the dashboard's lead
 * page, not a different one — the agent already knows how it works. Read
 * the lead's details first, then act — the CTAs sit at the bottom, not
 * above the fold, since there's nothing to decide until you've read them.
 */
export default function LeadActionPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const { lead, isLoading } = useLeadWithStatus(leadId);
  const { data: pipelines = [] } = usePipelines();
  const { data: pages = [] } = useLeadPages();
  const updateNote = useUpdateLeadNote();
  const updateStage = useUpdateLeadStage();
  const showSnack = useSnack();

  const [note, setNote] = useState(lead?.note ?? "");
  const [saveState, setSaveState] = useState("");
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [stageStep, setStageStep] = useState<{ step: OutcomeStep; stage: Stage } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setNote(lead?.note ?? ""), [lead?.id]);

  function saveNote(value: string) {
    if (!lead) return;
    setSaveState("Saving…");
    updateNote.mutate(
      { id: lead.id, note: value },
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

  const pipelineKind = lead ? pipelineKindFor(lead, pipelines) : "seller";
  const stagesForPipeline = PIPELINE_STAGES[pipelineKind];
  const sourcePage = lead?.source_page_id ? pages.find((p) => p.id === lead.source_page_id) : undefined;

  function handleStagePick(stage: Stage) {
    if (!lead) return;
    const step = STEP_FOR_STAGE[stage];
    if (step) {
      setStageStep({ step, stage });
      return;
    }
    const prev = { stage: lead.stage, next_label: lead.next_label, due: lead.due, reminder_at: lead.reminder_at, commission: lead.commission };
    updateStage.mutate({ id: lead.id, stage });
    showSnack(`${lead.name.split(" ")[0]} moved to ${stage}`, () =>
      updateStage.mutate({ id: lead.id, stage: prev.stage, override: prev }),
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.bg }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: "14px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Box sx={{ width: 20, height: 20, borderRadius: "5px", bgcolor: tokens.primary }} />
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>EstateKit</Typography>
      </Box>

      {isLoading ? (
        <LeadActionSkeleton />
      ) : !lead ? (
        <Box sx={{ p: 4 }}>
          <Typography color="text.secondary">This link isn't valid or has expired.</Typography>
        </Box>
      ) : (
        <Box sx={{ maxWidth: 720, mx: "auto", pb: 3 }}>
          <Typography sx={{ fontSize: 19, fontWeight: 600, m: "16px 16px 0" }}>{lead.name}</Typography>

          <Section title="Contact">
            <Row k="Phone" v={lead.phone} />
            <Row k="Email" v={lead.email || ""} />
            <Row k="Stage" v={lead.stage} />
            <Row k="Next" v={lead.next_label} />
            <Row k="Came from" v={sourcePage ? sourcePage.name : "Added manually"} />
          </Section>

          <Section title="From their form">
            {lead.form_answers.length ? (
              lead.form_answers.map((r, i) => <Row key={i} k={r.q} v={r.a} />)
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

          <Box sx={{ display: "flex", gap: 1.25, m: "18px 16px 0" }}>
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
          </Box>

          <Typography
            component="a"
            href="/leads"
            sx={{ display: "block", textAlign: "center", mt: 2, fontSize: 13, color: "text.disabled", textDecoration: "none", "&:hover": { color: tokens.primary } }}
          >
            Go to dashboard
          </Typography>

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
      )}
    </Box>
  );
}

function LeadActionSkeleton() {
  return (
    <Box sx={{ maxWidth: 720, mx: "auto", pb: 3, p: 2 }}>
      <Skeleton variant="text" width={180} height={32} sx={{ mb: 1 }} />
      <Skeleton variant="rounded" height={64} sx={{ mb: 1.5, borderRadius: "6px" }} />
      <Skeleton variant="rounded" height={140} sx={{ mb: 1.5, borderRadius: "6px" }} />
      <Skeleton variant="rounded" height={100} sx={{ borderRadius: "6px" }} />
    </Box>
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
      {k && <Typography sx={{ color: "text.secondary", fontSize: 13, flex: "0 0 46%" }}>{k}</Typography>}
      <Typography sx={{ fontSize: 14, flex: 1 }}>{v}</Typography>
    </Box>
  );
}
