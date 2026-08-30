import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppBar, Box, IconButton, Paper, TextField, Toolbar, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CallIcon from "@mui/icons-material/Call";
import { tokens } from "../theme";
import { useLead, useUpdateLeadNote, useUpdateLeadStage } from "../hooks/useLeads";
import { useSnack } from "../hooks/useSnack";
import { STEP_FOR_STAGE } from "../lib/stageLogic";
import StageMenu from "../components/StageMenu";
import OutcomeSheet from "../components/OutcomeSheet";
import type { OutcomeStep, Stage } from "../types";

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const lead = useLead(id);
  const updateNote = useUpdateLeadNote();
  const updateStage = useUpdateLeadStage();
  const showSnack = useSnack();

  const [note, setNote] = useState(lead?.note ?? "");
  const [saveState, setSaveState] = useState("");
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [stageStep, setStageStep] = useState<OutcomeStep | null>(null);
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

  function handleStagePick(stage: Stage) {
    const step = STEP_FOR_STAGE[stage];
    if (step) {
      setStageStep(step);
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
          <StageMenu current={lead.stage} onPick={handleStagePick}>
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

        <Section title="Contact">
          <Row k="Phone" v={lead.phone} />
          <Row k="Email" v={lead.email || ""} />
          <Row k="Stage" v={lead.stage} />
          <Row k="Next" v={lead.next_label} />
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
      </Box>

      <OutcomeSheet lead={lead} open={outcomeOpen} onClose={() => setOutcomeOpen(false)} onSnack={showSnack} />
      <OutcomeSheet
        lead={lead}
        open={!!stageStep}
        entryStep={stageStep ?? "main"}
        onClose={() => setStageStep(null)}
        onSnack={showSnack}
      />
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
      {k && (
        <Typography sx={{ color: "text.secondary", fontSize: 13, flex: "0 0 46%" }}>{k}</Typography>
      )}
      <Typography sx={{ fontSize: 14, flex: 1 }}>{v}</Typography>
    </Box>
  );
}
