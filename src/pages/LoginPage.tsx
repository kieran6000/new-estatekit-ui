import { useState } from "react";
import { Box, Button, Paper, TextField, Typography } from "@mui/material";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { tokens } from "../theme";
import { useAuth } from "../hooks/useAuth";
import estateKitLogo from "../assets/blue logo full.png";
import { ADMIN_WHATSAPP } from "../lib/contact";

const REQUEST_MESSAGE = "Hi, I'd like my EstateKit login details please.";

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
    setHint("");
    setBusy(true);
    const { error } = await signIn(normalizePhone(phone.trim()), password);
    setBusy(false);
    if (error) setHint("That phone number or password isn't right. Try again.");
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", p: 2.5, bgcolor: "background.default" }}>
      <Paper
        component="form"
        onSubmit={handleSubmit}
        elevation={2}
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
          autoComplete="tel"
          sx={{ mb: 1.75 }}
        />
        <TextField
          fullWidth
          type="password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          sx={{ mb: 2 }}
        />
        <Button fullWidth size="large" variant="contained" type="submit" disabled={busy || !phone.trim() || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        {hint && (
          <Typography variant="caption" color="error" sx={{ display: "block", textAlign: "center", mt: 1.75 }}>
            {hint}
          </Typography>
        )}

        <Box sx={{ mt: 3, pt: 2.5, borderTop: `1px solid ${tokens.divider}`, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
            Don't have a login yet?
          </Typography>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<WhatsAppIcon />}
            href={`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(REQUEST_MESSAGE)}`}
            target="_blank"
            rel="noopener"
            sx={{ color: "#128C7E", borderColor: "#cfe9e2", "&:hover": { borderColor: "#128C7E", bgcolor: "#f0fdf4" } }}
          >
            Request a login
          </Button>
          <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1.25 }}>
            Your admin sets up your account and sends your details.
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
