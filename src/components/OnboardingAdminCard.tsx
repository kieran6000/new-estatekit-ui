import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Button, Chip, TextField, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { tokens } from "../theme";
import { getOnboardingVideo, listOnboardingSubmissions, setOnboardingVideo } from "../api/onboarding";
import { canPlayVideo } from "./VideoPlayer";
import { useSnack } from "../hooks/useSnack";
import { timeAgo } from "../lib/timeAgo";

const LINK = "https://leads.estatekit.co/onboarding";

/** Staff, on the Accounts page: the onboarding form's link (send it after
 *  the call), the "what happens next" video, and the latest forms in, with
 *  whether their account was made and whether they watched the video. */
export default function OnboardingAdminCard() {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const { data: saved = "" } = useQuery({ queryKey: ["onboardingVideo"], queryFn: getOnboardingVideo });
  const { data: rows = [] } = useQuery({ queryKey: ["onboardingSubmissions"], queryFn: listOnboardingSubmissions, staleTime: 60_000 });
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

      {rows.length > 0 && (
        <Box sx={{ borderTop: `1px solid ${tokens.divider2}` }}>
          {rows.slice(0, 8).map((r) => (
            <Box key={r.id} sx={{ px: 2, py: 1.25, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", "& + &": { borderTop: `1px solid ${tokens.divider2}` } }}>
              <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{r.name} <Box component="span" sx={{ fontWeight: 400, color: "text.secondary" }}>· {r.agency}</Box></Typography>
                <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                  {r.campaign} · {[r.city, r.suburbs.join(", ")].filter(Boolean).join(": ")} · {timeAgo(r.created_at)}
                </Typography>
              </Box>
              <Chip size="small" variant="outlined"
                color={r.account_status === "created" ? "success" : r.account_status === "existing" ? "default" : "error"}
                label={r.account_status === "created" ? "Account made, login sent" : r.account_status === "existing" ? "Already had an account" : "Account not made"} />
              <Chip size="small" variant="outlined" color={r.video_watched_at ? "success" : "default"} label={r.video_watched_at ? "Watched the video" : "Not watched yet"} />
              {r.agent_id && <Button size="small" component={RouterLink} to={`/admin/clients/${r.agent_id}`}>Open</Button>}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
