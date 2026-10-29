import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { canPlayVideo } from "./VideoPlayer";
import { Box, Switch, TextField, Typography } from "@mui/material";
import { tokens } from "../theme";
import { updateLeadPage } from "../api/leadPages";
import { useCustomQuestions } from "../hooks/useCustomQuestions";
import { useAutosave } from "../hooks/useAutosave";
import type { LeadPage } from "../types";
import InfoTip from "./InfoTip";
import { CALL_QUESTION } from "./ThankYouExtras";

/** "Thank-you page": what people see after this form, besides the lead
 *  magnet. A short video, and asking when suits them for a call. Staff set
 *  it; agents see what's set. Saves as you go (give it key={page.id}). */
export default function ThankYouPageCard({ page, canSetUp }: { page: LeadPage; canSetUp: boolean }) {
  const qc = useQueryClient();
  const fb = page.sourceType === "fb_form";
  const { data: questions = [] } = useCustomQuestions(page.id);
  // The form already asks for a call time: asking again after it is noise.
  const formAsks = questions.some((q) => q.type === "call_time");

  const saved = { video: page.thankYouVideoUrl ?? "", askCall: page.thankYouAskCall === true, question: page.thankYouCallQuestion?.trim() || CALL_QUESTION };
  const [video, setVideo] = useState(saved.video);
  const [askCall, setAskCall] = useState(saved.askCall);
  const [question, setQuestion] = useState(saved.question);

  const url = video.trim();
  const playable = !url || canPlayVideo(url);
  const q = question.trim() || CALL_QUESTION;
  // Blank or the standard wording is stored as "not set", so a later change to the standard reaches it.
  useAutosave(
    { video: url, askCall, question: q },
    saved,
    async (v) => {
      await updateLeadPage(page.id, { thankYouVideoUrl: v.video || null, thankYouAskCall: v.askCall, thankYouCallQuestion: v.question === CALL_QUESTION ? null : v.question });
      await Promise.all([qc.invalidateQueries({ queryKey: ["leadPages"] }), qc.invalidateQueries({ queryKey: ["publicPageSlug"] })]);
    },
    { ready: canSetUp && playable },
  );

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
          A short video under the headline: who you are and what happens next. It shows in the preview a moment after you paste it. Paste a YouTube link or a video-file link (.mp4).
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
            {formAsks
              ? "This form already asks for a call time, so it isn't asked again."
              : fb
                ? "They type their number once, pick a day and a time, then Confirm. We match it to their lead and save it there, even if the lead arrives a few minutes later."
                : "They pick a day and a time, then Confirm. It's saved on their lead and becomes the main button on the page."}
          </Typography>
        </Box>
        <Switch checked={askCall && !formAsks} disabled={!canSetUp || formAsks} onChange={(e) => setAskCall(e.target.checked)} />
      </Box>
      {askCall && !formAsks && (
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

    </Box>
  );
}
