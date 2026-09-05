import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { getMyProfile, upsertProfile } from "../api/agentProfile";
import { updatePassword } from "../api/auth";
import { useSnack } from "../hooks/useSnack";
import AuthField from "../components/AuthField";
import AuthButton from "../components/AuthButton";
import estateKitLogo from "../assets/blue logo full.png";

export default function WelcomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const showSnack = useSnack();
  const { data: profile } = useQuery({ queryKey: ["myProfile"], queryFn: getMyProfile, enabled: !!user });

  const [stepIdx, setStepIdx] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [company, setCompany] = useState("");
  const [area, setArea] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  // Already onboarded → straight to the app.
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

  const TOTAL = 3;

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: 2.5, background: "linear-gradient(180deg, #eff4ff 0%, #f6f8fb 40%, #f6f8fb 100%)" }}>
      <Box sx={{ width: "100%", maxWidth: 420 }}>
        {/* progress dots */}
        <Box sx={{ display: "flex", justifyContent: "center", gap: 0.75, mb: 3 }}>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <Box key={i} sx={{ width: i === stepIdx ? 24 : 8, height: 8, borderRadius: 4, bgcolor: i <= stepIdx ? "#2563eb" : "#d1d5db", transition: "all .2s" }} />
          ))}
        </Box>

        <Box sx={{ bgcolor: "#fff", borderRadius: "16px", border: "1px solid #eceef1", boxShadow: "0 8px 30px rgba(17,24,39,0.06)", p: "28px 24px" }}>
          {stepIdx === 0 && (
            <Box sx={{ textAlign: "center" }}>
              <Box component="img" src={estateKitLogo} alt="EstateKit" sx={{ height: 30, mb: 3 }} />
              <Typography sx={{ fontSize: 24, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em", mb: 1 }}>
                Welcome, {firstName} 👋
              </Typography>
              <Typography sx={{ fontSize: 15, color: "#6b7280", lineHeight: 1.6, mb: 3.5 }}>
                This is where every Facebook lead lands, ready for you to call. Let's take 30 seconds to set up your account.
              </Typography>
              <AuthButton onClick={() => setStepIdx(1)}>Get started</AuthButton>
            </Box>
          )}

          {stepIdx === 1 && (
            <Box>
              <Typography sx={{ fontSize: 20, fontWeight: 700, color: "#111827", mb: 0.5 }}>Your details</Typography>
              <Typography sx={{ fontSize: 14, color: "#6b7280", mb: 3 }}>Confirm how you'll appear to your leads.</Typography>
              <AuthField label="Full name" value={displayName} onChange={setDisplayName} placeholder="Your name" autoFocus />
              <AuthField label="Agency" value={company} onChange={setCompany} placeholder="Your agency" />
              <AuthField label="Area you work" value={area} onChange={setArea} placeholder="e.g. Midrand" />
              <Box sx={{ display: "flex", gap: 1.5, mt: 1 }}>
                <AuthButton variant="ghost" onClick={() => setStepIdx(0)}>Back</AuthButton>
                <AuthButton onClick={() => setStepIdx(2)} disabled={!displayName.trim()}>Continue</AuthButton>
              </Box>
            </Box>
          )}

          {stepIdx === 2 && (
            <Box>
              <Typography sx={{ fontSize: 20, fontWeight: 700, color: "#111827", mb: 0.5 }}>Set your password</Typography>
              <Typography sx={{ fontSize: 14, color: "#6b7280", mb: 3 }}>Choose a password only you know. You'll use it to sign in from now on.</Typography>
              <AuthField label="New password" value={pw} onChange={setPw} type="password" placeholder="At least 6 characters" autoComplete="new-password" autoFocus />
              <AuthField label="Confirm password" value={pw2} onChange={setPw2} type="password" placeholder="Type it again" autoComplete="new-password" onEnter={finish} />
              <Box sx={{ display: "flex", gap: 1.5, mt: 1 }}>
                <AuthButton variant="ghost" onClick={() => setStepIdx(1)}>Back</AuthButton>
                <AuthButton onClick={finish} busy={busy} disabled={!pw || !pw2}>
                  {busy ? "Finishing…" : "Finish"}
                </AuthButton>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
