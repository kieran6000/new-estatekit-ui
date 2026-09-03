import { useState } from "react";
import { Box, Button, Paper, TextField, Typography } from "@mui/material";
import { tokens } from "../theme";
import { useAuth, DEV_BYPASS_PHONE, DEV_BYPASS_CODE } from "../hooks/useAuth";
import estateKitLogo from "../assets/blue logo full.png";

export default function LoginPage() {
  const { requestCode, verifyCode, authMode } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState(authMode === "dev_bypass" ? DEV_BYPASS_PHONE : "");
  const [code, setCode] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    if (!phone.trim()) return;
    setBusy(true);
    const { error } = await requestCode(phone.trim());
    setBusy(false);
    if (error) return setHint(error);
    setHint("");
    setStep(2);
    if (authMode === "dev_bypass") setCode(DEV_BYPASS_CODE);
  }

  async function verify() {
    const c = code.replace(/\D/g, "");
    if (c.length < 4) return;
    setBusy(true);
    const { error } = await verifyCode(phone.trim(), c);
    setBusy(false);
    if (error) setHint(error);
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", p: 2.5, bgcolor: "background.default" }}>
      <Paper sx={{ width: "100%", maxWidth: 380, borderRadius: "8px", p: "28px 24px 24px", borderTop: `4px solid ${tokens.primary}` }}>
        <Box component="img" src={estateKitLogo} alt="EstateKit" sx={{ height: 28, display: "block", mb: 0.5 }} />

        {step === 1 ? (
          <>
            <Typography variant="h6" sx={{ fontWeight: 500, mt: 1.75, mb: 0.25 }}>
              Sign in
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.25 }}>
              Enter your WhatsApp number and we'll send you a 4-digit code.
            </Typography>
            <TextField
              fullWidth
              label="WhatsApp number"
              placeholder="+27 82 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              sx={{ mb: 1.75 }}
            />
            <Button fullWidth variant="contained" disabled={busy} onClick={sendCode}>
              Send me a code
            </Button>
          </>
        ) : (
          <>
            <Typography variant="h6" sx={{ fontWeight: 500, mt: 1.75, mb: 0.25 }}>
              Check WhatsApp
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.25 }}>
              We sent a 4-digit code to {phone}.
            </Typography>
            <TextField
              fullWidth
              label="4-digit code"
              placeholder="____"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              sx={{ mb: 1.75 }}
            />
            <Button fullWidth variant="contained" disabled={busy} onClick={verify}>
              Sign in
            </Button>
            <Button fullWidth sx={{ mt: 0.75 }} onClick={() => setStep(1)}>
              Use a different number
            </Button>
          </>
        )}
        {hint && (
          <Typography variant="caption" color="error" sx={{ display: "block", textAlign: "center", mt: 1.75 }}>
            {hint}
          </Typography>
        )}
        {authMode === "dev_bypass" && (
          <Typography variant="caption" sx={{ display: "block", textAlign: "center", mt: 1.75, color: "text.disabled" }}>
            Dev bypass active — code is pre-filled.
          </Typography>
        )}
      </Paper>
    </Box>
  );
}
