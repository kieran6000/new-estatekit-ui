import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Button, TextField, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { tokens } from "../theme";
import { getOnboardingVideo, setOnboardingVideo } from "../api/onboarding";
import { canPlayVideo } from "./VideoPlayer";
import { useSnack } from "../hooks/useSnack";

const LINK = "https://leads.estatekit.co/onboarding";

/** Staff, on the Accounts page: the onboarding form's link (send it after
 *  the call) and the "what happens next" video. (The list of forms in went:
 *  the accounts table below already shows who joined.) */
export default function OnboardingAdminCard() {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const { data: saved = "" } = useQuery({ queryKey: ["onboardingVideo"], queryFn: getOnboardingVideo });
  const [video, setVideo] = useState(saved);
  useEffect(() => setVideo(saved), [saved]);
  const url = video.trim();
  const bad = !!url && !canPlayVideo(url);

  async function saveVideo() {
    if (bad || url === saved) return;
    try {
      await setOnboardingVideo(url);
      await qc.invalidateQueries({ queryKey: ["onboardingVideo"] });
      showSnack(url ? "Video saved." : "Video removed.");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't save the video. Try again.");
    }
  }

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: { md: "8px" }, overflow: "hidden" }}>
      <Box sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${tokens.divider2}` }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2 }}>Onboarding form</Typography>
        <Typography sx={{ fontSize: 12, color: tokens.ink3 }}>Send it after the call. It creates their account and WhatsApps and emails their login.</Typography>
      </Box>

      <Box sx={{ p: 2, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField size="small" label="Link" value={LINK} fullWidth slotProps={{ htmlInput: { readOnly: true } }} />
          <Button variant="outlined" startIcon={<ContentCopyIcon fontSize="small" />} sx={{ flexShrink: 0 }}
            onClick={() => navigator.clipboard.writeText(LINK).then(() => showSnack("Link copied"), () => showSnack("Couldn't copy. Select the link and copy it."))}>
            Copy
          </Button>
        </Box>
        <TextField
          size="small"
          label="“What happens next” video"
          placeholder="YouTube link or a video-file link (.mp4)"
          value={video}
          onChange={(e) => setVideo(e.target.value)}
          onBlur={saveVideo}
          onKeyDown={(e) => e.key === "Enter" && saveVideo()}
          error={bad}
          helperText={bad ? "That link can't be played. Use a YouTube link or a video-file link (.mp4)." : "Shown after they send the form. Saves when you click away."}
        />
      </Box>

    </Box>
  );
}
