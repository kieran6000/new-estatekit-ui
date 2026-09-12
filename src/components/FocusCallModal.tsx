import { useEffect, useMemo, useState } from "react";
import { Box, IconButton, LinearProgress, TextField, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CallIcon from "@mui/icons-material/Call";
import * as leadsApi from "../api/leads";
import { dueLeads, pipelineKindFor } from "../lib/stageLogic";
import { prettyAnswer, maskPhone } from "../lib/format";
import { timeAgo } from "../lib/timeAgo";
import { trackActivity } from "../lib/activity";
import { logLeadCall } from "../api/leadEvents";
import { useIsOperator } from "../hooks/useAutomations";
import type { LeadRow, Pipeline } from "../types";
import OutcomeSheet from "./OutcomeSheet";

export default function FocusCallModal({
  leads,
  pipelines,
  open,
  onClose,
  onSnack,
}: {
  leads: LeadRow[];
  pipelines: Pipeline[];
  open: boolean;
  onClose: () => void;
  onSnack: (msg: string) => void;
}) {
  const queue = useMemo(() => (open ? dueLeads(leads) : []), [open, leads]);
  const { data: isOperator } = useIsOperator();
  const [qi, setQi] = useState(0);
  const [note, setNote] = useState("");
  const [outcomeOpen, setOutcomeOpen] = useState(false);

  useEffect(() => {
    if (open) setQi(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body.style;
    const prev = { position: body.position, top: body.top, width: body.width, overflow: body.overflow };
    body.position = "fixed";
    body.top = `-${scrollY}px`;
    body.width = "100%";
    body.overflow = "hidden";
    return () => {
      body.position = prev.position;
      body.top = prev.top;
      body.width = prev.width;
      body.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  useEffect(() => setNote(""), [qi]);

  if (!open) return null;

  const total = queue.length;
  const lead = queue[qi];
  const done = qi >= total;

  async function saveNoteAndCall() {
    if (lead) {
      trackActivity("call_started", { lead: { id: lead.id, name: lead.name, phone: lead.phone, stage: lead.stage } });
      logLeadCall(lead.id, lead.agent_id);
    }
    if (note.trim() && lead) {
      const merged = (lead.note ? lead.note + " · " : "") + note.trim();
      await leadsApi.updateLead(lead.id, { note: merged });
    }
    setOutcomeOpen(true);
  }

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        // Above MUI's default AppBar z-index (1100) — otherwise the sticky
        // page header pokes through the top of this fullscreen overlay.
        zIndex: (theme) => theme.zIndex.modal,
        display: "flex",
        justifyContent: "center",
        bgcolor: { xs: "#263238", sm: "rgba(0,0,0,.6)" },
      }}
    >
    <Box sx={{ width: "100%", maxWidth: { xs: "100%", sm: 560 }, maxHeight: { sm: "85vh" }, borderRadius: { sm: "12px" }, my: { sm: "auto" }, bgcolor: "#263238", display: "flex", flexDirection: "column", color: "#fff", overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: "12px 12px 12px 16px", bgcolor: "#1c272c", flexShrink: 0 }}>
        <Box sx={{ flex: 1, maxWidth: 280 }}>
          <LinearProgress
            variant="determinate"
            value={total ? (qi / total) * 100 : 100}
            sx={{ height: 4, borderRadius: 2, bgcolor: "rgba(255,255,255,.2)", "& .MuiLinearProgress-bar": { bgcolor: "#66bb6a" } }}
          />
        </Box>
        <Typography variant="caption" sx={{ color: "#b0bec5" }}>
          {!done ? `${qi + 1} of ${total}` : ""}
        </Typography>
        <IconButton onClick={onClose} sx={{ ml: "auto", color: "#fff" }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {done ? (
          <Box sx={{ m: "auto", textAlign: "center", p: 3 }}>
            <Typography sx={{ fontSize: 24, mb: 1 }}>All done</Typography>
            <Typography sx={{ color: "#90a4ae", mb: 3 }}>
              You called {total} {total === 1 ? "person" : "people"} today.
            </Typography>
            <Box
              component="button"
              onClick={onClose}
              sx={{
                bgcolor: "#43a047",
                color: "#fff",
                border: 0,
                borderRadius: "6px",
                px: 3.5,
                py: 1.75,
                fontSize: 17,
                fontWeight: 500,
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Back to leads
            </Box>
          </Box>
        ) : (
          <>
            <Box sx={{ flex: 1, overflow: "auto", px: 1.75, pb: 1.5 }}>
              <Typography sx={{ fontSize: 22, fontWeight: 500, textAlign: "center", pt: 1.75 }}>{lead.name}</Typography>
              <Typography sx={{ color: "#b0bec5", fontSize: 15, textAlign: "center" }}>{isOperator ? lead.phone : maskPhone(lead.phone)}</Typography>
              <Typography sx={{ color: "#78909c", fontSize: 12.5, textAlign: "center", mb: 2 }}>Came in {timeAgo(lead.created_at)}</Typography>
              <Typography sx={{ color: "#90a4ae", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", m: "16px 4px 6px" }}>
                From their form
              </Typography>
              <Box sx={{ bgcolor: "#eceff1", color: "#1b2431", borderRadius: "8px", overflow: "hidden" }}>
                {lead.form_answers.length ? (
                  lead.form_answers.map((r, i) => (
                    <Box key={i} sx={{ p: "12px 14px", borderTop: i ? "1px solid #d5dbe0" : 0 }}>
                      <Typography sx={{ fontSize: 12, color: "#5a6577" }}>{r.q}</Typography>
                      <Typography sx={{ fontSize: 16, fontWeight: 500, color: "#141b2e", mt: 0.25 }}>{prettyAnswer(r.a)}</Typography>
                    </Box>
                  ))
                ) : (
                  <Box sx={{ p: "12px 14px" }}>
                    <Typography sx={{ fontSize: 16 }}>No answers captured.</Typography>
                  </Box>
                )}
              </Box>
              <TextField
                fullWidth
                placeholder="Quick note (optional)…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                sx={{
                  mt: 1.5,
                  "& .MuiInputBase-root": { bgcolor: "#37474f", color: "#eceff1", borderRadius: "6px" },
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,.14)" },
                }}
              />
            </Box>
            <Box sx={{ flexShrink: 0, bgcolor: "#1c272c", borderTop: "1px solid #0e1519", p: "12px 16px", display: "flex", gap: 1 }}>
              <Box
                component="button"
                onClick={() => setQi((n) => n + 1)}
                sx={{
                  bgcolor: "transparent",
                  color: "#b0bec5",
                  border: "1px solid rgba(255,255,255,.25)",
                  borderRadius: "6px",
                  p: "16px 20px",
                  fontSize: 15,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Skip
              </Box>
              <Box
                component="a"
                href={`tel:${lead.phone.replace(/\s/g, "")}`}
                onClick={saveNoteAndCall}
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1.25,
                  bgcolor: "#43a047",
                  color: "#fff",
                  borderRadius: "6px",
                  p: "16px",
                  fontSize: 17,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                }}
              >
                <CallIcon /> Call {lead.name.split(" ")[0]}
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Box>

      <OutcomeSheet
        lead={lead}
        pipelineKind={lead ? pipelineKindFor(lead, pipelines) : "seller"}
        open={outcomeOpen}
        onClose={() => setOutcomeOpen(false)}
        onSnack={onSnack}
        onLogged={() => setQi((n) => n + 1)}
      />
    </Box>
  );
}
