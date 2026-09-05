import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { useAuth } from "../hooks/useAuth";
import AuthField from "../components/AuthField";
import AuthButton from "../components/AuthButton";
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

  async function submit() {
    if (!phone.trim() || !password) return;
    setHint("");
    setBusy(true);
    const { error } = await signIn(normalizePhone(phone.trim()), password);
    setBusy(false);
    if (error) setHint("That phone number or password isn't right. Try again.");
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        p: 2.5,
        background: "linear-gradient(180deg, #eff4ff 0%, #f6f8fb 40%, #f6f8fb 100%)",
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 400 }}>
        <Box sx={{ textAlign: "center", mb: 3 }}>
          <Box component="img" src={estateKitLogo} alt="EstateKit" sx={{ height: 34, mb: 3 }} />
          <Typography sx={{ fontSize: 26, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em" }}>
            Welcome back
          </Typography>
          <Typography sx={{ fontSize: 15, color: "#6b7280", mt: 0.5 }}>
            Sign in to your leads dashboard
          </Typography>
        </Box>

        <Box
          sx={{
            bgcolor: "#fff",
            borderRadius: "16px",
            border: "1px solid #eceef1",
            boxShadow: "0 8px 30px rgba(17,24,39,0.06)",
            p: "24px 22px",
          }}
        >
          <AuthField
            label="Phone number"
            value={phone}
            onChange={setPhone}
            placeholder="082 123 4567"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
          />
          <AuthField
            label="Password"
            value={password}
            onChange={setPassword}
            type="password"
            placeholder="Your password"
            autoComplete="current-password"
            onEnter={submit}
          />
          {hint && (
            <Typography sx={{ fontSize: 13, color: "#dc2626", mb: 1.5, textAlign: "center" }}>
              {hint}
            </Typography>
          )}
          <AuthButton type="button" onClick={submit} busy={busy} disabled={!phone.trim() || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </AuthButton>
        </Box>

        <Typography sx={{ fontSize: 13, color: "#9ca3af", textAlign: "center", mt: 2.5 }}>
          New agent? Your admin will set up your account and send you your login.
        </Typography>
      </Box>
    </Box>
  );
}
