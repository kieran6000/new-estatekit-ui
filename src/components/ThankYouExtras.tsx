import { useState } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { supabase } from "../api/_client";
import { readableOn } from "../lib/contrast";
import CallTimeStep, { CALL_TIME_CONFIRM, callTimeIncomplete } from "./CallTimeStep";

// The thank-you page's call-time ask, set per form (Forms → Thank-you page).
// The video sits under the headline (ThankYouPage).

export const CALL_QUESTION = "When suits you for a quick call?";

/** "When suits you for a quick call?" with Day and Time, then Confirm. Saved
 *  on the lead with their private code (set_call_time). Only shown when we
 *  know who they are (leads from our own forms). */
export function ThankYouCallTime({ token, preview, accent, agentName, question }: { token: string; preview?: boolean; accent: string; agentName: string; question?: string | null }) {
  const agentFirst = (agentName || "").trim().split(/\s+/)[0] || "We";
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");

  async function confirm() {
    if (!value || callTimeIncomplete(value)) {
      setError(!value ? "Please pick a day and a time." : value.startsWith(",") ? "Please pick a day too." : "Please pick a time too.");
      return;
    }
    if (preview) {
      setError("Preview only: nothing was saved.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: e } = await supabase.rpc("set_call_time", { p_token: token, p_value: value });
      if (e || data !== true) throw e ?? new Error("not saved");
      setSaved(value);
    } catch (err) {
      console.error(err);
      setError("That didn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <Box sx={{ mt: 3.5, pt: 3, borderTop: "1px solid #eee" }}>
        <Box sx={{ display: "flex", gap: 1.25, alignItems: "flex-start", p: 2, borderRadius: "10px", bgcolor: "#e6f4ea", color: "#137333" }}>
          <CheckCircleIcon sx={{ mt: "1px" }} />
          <Box>
            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Done: {saved}</Typography>
            <Typography sx={{ fontSize: 14, mt: 0.25 }}>{agentFirst} will call you around then to confirm.</Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 3.5, pt: 1.5, borderTop: "1px solid #eee", textAlign: "left" }}>
      <CallTimeStep
        question={question?.trim() || CALL_QUESTION}
        required={false}
        confirmText={CALL_TIME_CONFIRM.replaceAll("{agent}", agentFirst)}
        value={value}
        error={error}
        onChange={(v) => { setError(""); setValue(v); }}
      />
      {/* The form's own button (LeadCaptureForm), so it looks the same. */}
      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={confirm}
        disabled={busy}
        startIcon={busy ? <CircularProgress size={18} sx={{ color: "inherit" }} /> : undefined}
        sx={{ mt: 3, bgcolor: accent, color: readableOn(accent), "&:hover": { bgcolor: accent, filter: "brightness(0.9)" }, "&.Mui-disabled": { bgcolor: accent, color: readableOn(accent), opacity: 0.7 } }}
      >
        Confirm call time
      </Button>
    </Box>
  );
}
