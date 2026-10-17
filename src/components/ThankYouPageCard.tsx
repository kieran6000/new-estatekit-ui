import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { canPlayVideo } from "./VideoPlayer";
import { Box, Button, CircularProgress, Switch, TextField, Typography } from "@mui/material";
import { tokens } from "../theme";
import { updateLeadPage } from "../api/leadPages";
import { useCustomQuestions } from "../hooks/useCustomQuestions";
import { useSnack } from "../hooks/useSnack";
import type { LeadPage } from "../types";
import InfoTip from "./InfoTip";
import { CALL_QUESTION } from "./ThankYouExtras";

/** "Thank-you page": what people see after this form, besides the lead
 *  magnet. A short video, and asking when suits them for a call. Staff set
 *  it; agents see what's set. */
export default function ThankYouPageCard({ page, canSetUp }: { page: LeadPage; canSetUp: boolean }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const fb = page.sourceType === "fb_form";
  const { data: questions = [] } = useCustomQuestions(page.id);
  // The form already asks for a call time: asking again after it is noise.
  const formAsks = questions.some((q) => q.type === "call_time");

  const saved = { video: page.thankYouVideoUrl ?? "", askCall: page.thankYouAskCall === true, question: page.thankYouCallQuestion?.trim() || CALL_QUESTION };
  const [video, setVideo] = useState(saved.video);
  const [askCall, setAskCall] = useState(saved.askCall);
  const [question, setQuestion] = useState(saved.question);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setVideo(page.thankYouVideoUrl ?? "");
    setAskCall(page.thankYouAskCall === true);
    setQuestion(page.thankYouCallQuestion?.trim() || CALL_QUESTION);
  }, [page.id, page.thankYouVideoUrl, page.thankYouAskCall, page.thankYouCallQuestion]);

  const url = video.trim();
  const playable = !url || canPlayVideo(url);
  const q = question.trim() || CALL_QUESTION;
  const changed = url !== saved.video || askCall !== saved.askCall || q !== saved.question;

  async function save() {
    if (!playable) return;
    setBusy(true);
    try {
      await updateLeadPage(page.id, { thankYouVideoUrl: url || null, thankYouAskCall: askCall, thankYouCallQuestion: q === CALL_QUESTION ? null : q });
      await Promise.all([qc.invalidateQueries({ queryKey: ["leadPages"] }), qc.invalidateQueries({ queryKey: ["publicPageSlug"] })]);
      showSnack("Thank-you page saved.");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>Video & call time</Typography>
        <InfoTip>What people see straight after this form, as well as the lead magnet.</InfoTip>
      </Box>

      {/* Video */}
      <Box>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Video</Typography>
        <Typography sx={{ fontSize: 12.5, color: "text.secondary", mb: 1 }}>
          A short video under the headline: who you are and what happens next. It shows in the preview once saved. Paste a YouTube link or a video-file link (.mp4).
        </Typography>
        <TextField
          size="small"
          fullWidth
          placeholder="e.g. https://youtu.be/…"
          value={video}
          disabled={!canSetUp}
          onChange={(e) => setVideo(e.target.value)}
          error={!playable}
          helperText={!playable ? "That link can't be played. Use a YouTube link or a video-file link (.mp4)." : " "}
        />
      </Box>

      {/* Call time */}
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Ask when suits them for a call</Typography>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
            {fb
              ? "Not for Facebook forms: we don't know who is on the thank-you page, so the time can't be saved on their lead."
              : formAsks
                ? "This form already asks for a call time, so it isn't asked again."
                : "They pick a day and a time, then Confirm. It's saved on their lead and becomes the main button on the page."}
          </Typography>
        </Box>
        <Switch checked={askCall && !fb && !formAsks} disabled={!canSetUp || fb || formAsks} onChange={(e) => setAskCall(e.target.checked)} />
      </Box>
      {askCall && !fb && !formAsks && (
        <TextField
          size="small"
          fullWidth
          label="Question"
          value={question}
          disabled={!canSetUp}
          onChange={(e) => setQuestion(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 80 } }}
          helperText="Leave it as it is, or word it your way, e.g. When can I call you to go through your valuation?"
          sx={{ mt: -0.5 }}
        />
      )}

      {canSetUp && (
        <Button variant="contained" disabled={busy || !changed || !playable} onClick={save} startIcon={busy ? <CircularProgress size={14} /> : undefined} sx={{ alignSelf: "flex-start" }}>
          Save
        </Button>
      )}
    </Box>
  );
}
