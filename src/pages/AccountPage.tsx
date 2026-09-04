import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  Skeleton,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { getMyProfile, upsertProfile } from "../api/agentProfile";
import { useIsOperator } from "../hooks/useAutomations";
import { useSnack } from "../hooks/useSnack";
import AccountSwitcher from "../components/AccountSwitcher";
import { supabase } from "../api/_client";
import { tokens } from "../theme";

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const showSnack = useSnack();
  const { data: isOperator } = useIsOperator();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["myProfile"],
    queryFn: getMyProfile,
    enabled: !!user,
  });

  const [form, setForm] = useState({
    displayName: "",
    email: "",
    whatsappNumber: "",
    area: "",
    company: "",
    renewalDate: "",
    sidebarColor: "#111827",
    sidebarLogoUrl: null as string | null,
  });

  useEffect(() => {
    if (profile) {
      setForm({
        displayName: profile.displayName,
        email: profile.email,
        whatsappNumber: profile.whatsappNumber,
        area: profile.area,
        company: profile.company,
        renewalDate: profile.renewalDate ?? "",
        sidebarColor: profile.sidebarColor || "#111827",
        sidebarLogoUrl: profile.sidebarLogoUrl,
      });
    }
  }, [profile]);

  const autosave = useCallback(
    (patch: Partial<typeof form>) => {
      const next = { ...form, ...patch };
      setForm(next);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await upsertProfile(next);
        queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      }, 600);
    },
    [form, queryClient],
  );

  function update(field: keyof typeof form, value: string | null) {
    autosave({ [field]: value });
  }

  async function onLogoUpload(file: File | null) {
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) { showSnack("Image must be under 2 MB"); return; }
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (error) { showSnack("Upload failed: " + error.message); return; }
    const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
    update("sidebarLogoUrl", urlData.publicUrl);
    showSnack("Logo uploaded");
  }

  if (!user) return null;

  const adsManagerUrl = profile?.fbAdAccountId
    ? `https://business.facebook.com/billing_hub/payment_activity?asset_id=${profile.fbAdAccountId}`
    : "https://business.facebook.com/billing_hub/payment_activity";

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Account</Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 520, mx: "auto", mt: 3, px: 2, pb: 6 }}>
        {isLoading ? (
          <Skeleton variant="rounded" height={400} sx={{ borderRadius: "8px" }} />
        ) : (
          <>
            {isOperator && (
              <Card variant="outlined" sx={{ mb: 3 }}>
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Switch account
                  </Typography>
                  <AccountSwitcher variant="light" />
                </CardContent>
              </Card>
            )}

            <Card variant="outlined" sx={{ mb: 3 }}>
              <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Profile
                </Typography>
                <TextField label="Full name" value={form.displayName} onChange={(e) => update("displayName", e.target.value)} fullWidth />
                <TextField label="Email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} fullWidth />
                <TextField label="WhatsApp number" value={form.whatsappNumber} onChange={(e) => update("whatsappNumber", e.target.value)} fullWidth />
                <TextField label="Area / region" value={form.area} onChange={(e) => update("area", e.target.value)} fullWidth />
                <TextField label="Company / agency" value={form.company} onChange={(e) => update("company", e.target.value)} fullWidth />
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ mb: 3 }}>
              <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Sidebar
                </Typography>

                <Box>
                  <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>Accent color</Typography>
                  <Box
                    component="label"
                    sx={{
                      position: "relative",
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      bgcolor: form.sidebarColor,
                      outline: `1px solid ${tokens.divider}`,
                      cursor: "pointer",
                      display: "block",
                      overflow: "hidden",
                    }}
                  >
                    <input
                      type="color"
                      value={form.sidebarColor}
                      onChange={(e) => update("sidebarColor", e.target.value)}
                      style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", border: 0, padding: 0 }}
                    />
                  </Box>
                </Box>

                <Box>
                  <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>Logo</Typography>
                  <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                    <Box sx={{ position: "relative" }}>
                      <Box
                        component="label"
                        sx={{
                          width: 64, height: 64, borderRadius: "8px",
                          border: `2px dashed ${form.sidebarLogoUrl ? tokens.primary : tokens.divider}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", overflow: "hidden",
                          bgcolor: form.sidebarLogoUrl ? form.sidebarColor : tokens.bg,
                          "&:hover": { borderColor: tokens.primary },
                        }}
                      >
                        {form.sidebarLogoUrl ? (
                          <Box component="img" src={form.sidebarLogoUrl} alt="" sx={{ width: "100%", height: "100%", objectFit: "contain", p: 0.5 }} />
                        ) : (
                          <AddIcon sx={{ fontSize: 20, color: "text.disabled" }} />
                        )}
                        <input type="file" hidden accept="image/*" onChange={(e) => onLogoUpload(e.target.files?.[0] ?? null)} />
                      </Box>
                      {form.sidebarLogoUrl && (
                        <IconButton
                          size="small"
                          onClick={() => { update("sidebarLogoUrl", null); showSnack("Logo removed"); }}
                          sx={{ position: "absolute", top: -8, right: -8, width: 20, height: 20, bgcolor: "#e0e0e0", "&:hover": { bgcolor: "#bdbdbd" } }}
                        >
                          <CloseIcon sx={{ fontSize: 12 }} />
                        </IconButton>
                      )}
                    </Box>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                      {form.sidebarLogoUrl ? "Click to replace" : "Upload your logo"}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ mb: 3 }}>
              <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Contract
                </Typography>

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Plan
                  </Typography>
                  <Chip
                    label={profile?.tier === "paid" ? "Paid" : "Free"}
                    color={profile?.tier === "paid" ? "success" : "default"}
                    size="small"
                  />
                </Box>

                <TextField
                  label="Renewal date"
                  type="date"
                  value={form.renewalDate}
                  onChange={(e) => update("renewalDate", e.target.value)}
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                />

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Agreement PDF
                  </Typography>
                  {profile?.contractPdfUrl ? (
                    <Typography
                      component="a"
                      href={profile.contractPdfUrl}
                      target="_blank"
                      rel="noopener"
                      sx={{ fontSize: 14, color: "primary.main" }}
                    >
                      View contract
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.disabled">
                      No contract uploaded
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>

            {isOperator && profile && (
              <Card
                variant="outlined"
                sx={{ mb: 3, cursor: "pointer", "&:hover": { borderColor: "primary.main" } }}
                onClick={() => window.open(adsManagerUrl, "_blank")}
              >
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Ad spend
                    </Typography>
                    <OpenInNewIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                        Balance
                      </Typography>
                      <Typography sx={{ fontSize: 28, fontWeight: 700 }}>
                        R {profile.adspendBalance.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                      </Typography>
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                      Billing method
                    </Typography>
                    <Chip
                      icon={profile.billingType === "card" ? <CreditCardIcon /> : <AccountBalanceWalletIcon />}
                      label={profile.billingType === "card" ? "Card" : "Prepaid"}
                      color={profile.billingType === "card" ? "primary" : "warning"}
                      size="small"
                    />
                  </Box>
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                    Tap to open Ads Manager billing
                  </Typography>
                </CardContent>
              </Card>
            )}

            <Divider sx={{ mb: 2 }} />

            <Button
              variant="outlined"
              color="error"
              startIcon={<LogoutIcon />}
              onClick={signOut}
              fullWidth
            >
              Sign out
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}
