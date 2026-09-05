import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, LinearProgress, Paper, TextField, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tokens } from "../theme";
import { useAuth } from "../hooks/useAuth";
import { getMyProfile, upsertProfile } from "../api/agentProfile";
import { updatePassword } from "../api/auth";
import { useSnack } from "../hooks/useSnack";
import estateKitLogo from "../assets/blue logo full.png";

export default function WelcomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const showSnack = useSnack();
  const { data: profile, isLoading } = useQuery({ queryKey: ["myProfile"], queryFn: getMyProfile, enabled: !!user });

  const [stepIdx, setStepIdx] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [company, setCompany] = useState("");
  const [area, setArea] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  // Already onboarded → straight into the app.
  useEffect(() => {
    if (profile?.onboarded) navigate("/leads", { replace: true });
  }, [profile?.onboarded, navigate]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || "");
      setCompany(profile.company || "");
      setArea(profile.area || "");
    }
  }, [profile]);

  const firstName = (displayName || profile?.displayName || "there").trim().split(" ")[0];
  const TOTAL = 3;

  async function finish() {
    if (pw && pw !== pw2) { showSnack("Passwords don't match"); return; }
    if (pw && pw.length < 6) { showSnack("Password must be at least 6 characters"); return; }
    setBusy(true);
    try {
      if (pw) {
        const { error } = await updatePassword(pw);
        if (error) { showSnack(error); setBusy(false); return; }
      }
      await upsertProfile({ displayName: displayName.trim(), company: company.trim(), area: area.trim(), onboarded: true });
      await qc.invalidateQueries({ queryKey: ["myProfile"] });
      await qc.invalidateQueries({ queryKey: ["amIOnboarded"] });
      navigate("/leads", { replace: true });
    } catch (e) {
      showSnack(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LinearProgress sx={{ width: 160 }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", p: 2.5, bgcolor: "background.default" }}>
      <Paper elevation={2} sx={{ width: "100%", maxWidth: 400, borderRadius: "8px", overflow: "hidden", borderTop: `4px solid ${tokens.primary}` }}>
        <LinearProgress variant="determinate" value={((stepIdx + 1) / TOTAL) * 100} sx={{ height: 4 }} />
        <Box sx={{ p: "24px" }}>
          {stepIdx === 0 && (
            <Box sx={{ textAlign: "center" }}>
              <Box component="img" src={estateKitLogo} alt="EstateKit" sx={{ height: 30, mb: 2.5 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Welcome, {firstName} 👋</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, mb: 3 }}>
                This is where every Facebook lead lands, ready for you to call. Let's take 30 seconds to set up your account.
              </Typography>
              <Button fullWidth size="large" variant="contained" onClick={() => setStepIdx(1)}>Get started</Button>
            </Box>
          )}

          {stepIdx === 1 && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>Your details</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>Confirm how you'll appear to your leads.</Typography>
              <TextField fullWidth label="Full name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} sx={{ mb: 2 }} />
              <TextField fullWidth label="Agency" value={company} onChange={(e) => setCompany(e.target.value)} sx={{ mb: 2 }} />
              <TextField fullWidth label="Area you work" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Midrand" sx={{ mb: 2.5 }} />
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <Button fullWidth variant="outlined" onClick={() => setStepIdx(0)}>Back</Button>
                <Button fullWidth variant="contained" onClick={() => setStepIdx(2)} disabled={!displayName.trim()}>Continue</Button>
              </Box>
            </Box>
          )}

          {stepIdx === 2 && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>Set your password</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>Choose a password only you know — you'll use it to sign in from now on.</Typography>
              <TextField fullWidth type="password" label="New password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="At least 6 characters" sx={{ mb: 2 }} />
              <TextField fullWidth type="password" label="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" sx={{ mb: 2.5 }} />
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <Button fullWidth variant="outlined" onClick={() => setStepIdx(1)} disabled={busy}>Back</Button>
                <Button fullWidth variant="contained" onClick={finish} disabled={busy || !pw || !pw2}>{busy ? "Finishing…" : "Finish"}</Button>
              </Box>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
