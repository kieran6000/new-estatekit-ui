import { useState } from "react";
import { Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { supabase } from "../api/_client";
import { readableOn } from "../lib/contrast";
import CallTimeStep, { CALL_TIME_CONFIRM, callTimeIncomplete } from "./CallTimeStep";
import { formatLeadPhone, leadPhoneMessage, leadPhoneProblem } from "../lib/leadPhone";

// The thank-you page's call-time ask, set per form (Forms → Thank-you page).
// The video sits under the headline (ThankYouPage).

export const CALL_QUESTION = "When suits you for a quick call?";

/** "When suits you for a quick call?" with Day and Time, then Confirm. Saved
 *  on the lead with their private code (set_call_time) when we know who they
 *  are (leads from our own forms). From a Facebook instant form's end button
 *  we don't: they type their number once (byPhone) and request_call_time
 *  matches it to their lead, now or when it arrives. */
export function ThankYouCallTime({ token, slug, byPhone, preview, accent, agentName, question }: { token: string; slug?: string; byPhone?: boolean; preview?: boolean; accent: string; agentName: string; question?: string | null }) {
  const agentFirst = (agentName || "").trim().split(/\s+/)[0] || "We";
  const [value, setValue] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");

  async function confirm() {
    if (byPhone) {
      const problem = leadPhoneProblem(phone);
      if (problem) { setPhoneError(leadPhoneMessage(problem)); return; }
    }
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
      const { data, error: e } = byPhone
        ? await supabase.rpc("request_call_time", { p_slug: slug ?? "", p_phone: phone, p_value: value })
        : await supabase.rpc("set_call_time", { p_token: token, p_value: value });
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
      {byPhone && (
        <Box sx={{ mt: 2.5 }}>
          <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 0.5 }}>Last step: lock in your time</Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 1.25 }}>
            Which WhatsApp number should {agentFirst} call you on? Your slot isn't saved until you add it.
          </Typography>
          <TextField
            placeholder="082 000 0000"
            value={phone}
            onChange={(e) => {
              const v = e.target.value;
              setPhone(e.target.selectionStart === v.length ? formatLeadPhone(v) : v);
              setPhoneError("");
            }}
            fullWidth
            error={!!phoneError}
            helperText={phoneError || " "}
            slotProps={{ htmlInput: { inputMode: "tel", autoComplete: "tel" } }}
          />
        </Box>
      )}
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
        {byPhone ? "Lock in my call time" : "Confirm call time"}
      </Button>
    </Box>
  );
}
