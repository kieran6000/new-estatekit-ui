import { useState } from "react";
import { Box, Button, Paper, TextField, Typography } from "@mui/material";
import { tokens } from "../theme";
import { useAuth } from "../hooks/useAuth";
import estateKitLogo from "../assets/blue logo full.png";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, "");
  if (digits.startsWith("0") && digits.length === 10) return "+27" + digits.slice(1);
  if (digits.startsWith("27") && digits.length === 11) return "+" + digits;
  if (digits.startsWith("+")) return digits;
  if (/^\d{9,15}$/.test(digits)) return "+" + digits;
  return digits;
}

export default function LoginPage() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim() || !password) return;
    const normalized = normalizePhone(phone.trim());
    setBusy(true);
    const { error } = await signIn(normalized, password);
    setBusy(false);
    if (error) setHint(error);
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", p: 2.5, bgcolor: "background.default" }}>
      <Paper
        component="form"
        onSubmit={handleSubmit}
        sx={{ width: "100%", maxWidth: 380, borderRadius: "8px", p: "28px 24px 24px", borderTop: `4px solid ${tokens.primary}` }}
      >
        <Box component="img" src={estateKitLogo} alt="EstateKit" sx={{ height: 28, display: "block", mb: 0.5 }} />

        <Typography variant="h6" sx={{ fontWeight: 500, mt: 1.75, mb: 0.25 }}>
          Sign in
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.25 }}>
          Enter your phone number and password.
        </Typography>
        <TextField
          fullWidth
          label="Phone number"
          placeholder="082 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          sx={{ mb: 1.5 }}
        />
        <TextField
          fullWidth
          type="password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          sx={{ mb: 1.75 }}
        />
        <Button fullWidth variant="contained" type="submit" disabled={busy}>
          Sign in
        </Button>
        {hint && (
          <Typography variant="caption" color="error" sx={{ display: "block", textAlign: "center", mt: 1.75 }}>
            {hint}
          </Typography>
        )}
      </Paper>
    </Box>
  );
}
