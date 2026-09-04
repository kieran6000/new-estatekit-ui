import { useEffect, useRef, useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Skeleton,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import SaveIcon from "@mui/icons-material/Save";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteIcon from "@mui/icons-material/Delete";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { getMyProfile, upsertProfile } from "../api/agentProfile";
import { useIsOperator } from "../hooks/useAutomations";
import { useSnack } from "../hooks/useSnack";
import AccountSwitcher from "../components/AccountSwitcher";
import { supabase } from "../api/_client";

const PRESET_COLORS = [
  "#111827", "#1e293b", "#0f172a", "#1a1a2e",
  "#2563eb", "#1d4ed8", "#7c3aed", "#4f46e5",
  "#059669", "#0d9488", "#0891b2", "#0284c7",
  "#dc2626", "#e11d48", "#c026d3", "#9333ea",
  "#f5f5f4", "#fafaf9", "#f8fafc", "#ffffff",
];

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const showSnack = useSnack();
  const { data: isOperator } = useIsOperator();
  const logoInputRef = useRef<HTMLInputElement>(null);

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
  });
  const [sidebarColor, setSidebarColor] = useState("#111827");
  const [sidebarLogoUrl, setSidebarLogoUrl] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        displayName: profile.displayName,
        email: profile.email,
        whatsappNumber: profile.whatsappNumber,
        area: profile.area,
        company: profile.company,
        renewalDate: profile.renewalDate ?? "",
      });
      setSidebarColor(profile.sidebarColor || "#111827");
      setSidebarLogoUrl(profile.sidebarLogoUrl);
      setDirty(false);
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: () => upsertProfile({ ...form, sidebarColor, sidebarLogoUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      showSnack("Profile saved");
      setDirty(false);
    },
  });

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (error) {
      showSnack("Upload failed: " + error.message);
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
    setSidebarLogoUrl(urlData.publicUrl);
    setDirty(true);
    setUploading(false);
    showSnack("Logo uploaded");
  }

  function removeLogo() {
    setSidebarLogoUrl(null);
    setDirty(true);
  }

  if (!user) return null;

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
                <TextField
                  label="Full name"
                  value={form.displayName}
                  onChange={(e) => update("displayName", e.target.value)}
                  fullWidth
                />
                <TextField
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  fullWidth
                />
                <TextField
                  label="WhatsApp number"
                  value={form.whatsappNumber}
                  onChange={(e) => update("whatsappNumber", e.target.value)}
                  fullWidth
                />
                <TextField
                  label="Area / region"
                  value={form.area}
                  onChange={(e) => update("area", e.target.value)}
                  fullWidth
                />
                <TextField
                  label="Company / agency"
                  value={form.company}
                  onChange={(e) => update("company", e.target.value)}
                  fullWidth
                />
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ mb: 3 }}>
              <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Sidebar
                </Typography>

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Background color
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    {PRESET_COLORS.map((c) => (
                      <Box
                        key={c}
                        onClick={() => { setSidebarColor(c); setDirty(true); }}
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: "6px",
                          bgcolor: c,
                          cursor: "pointer",
                          border: sidebarColor === c ? "2.5px solid #2563eb" : "1px solid #d1d5db",
                          transition: "border 0.15s",
                          "&:hover": { transform: "scale(1.1)" },
                        }}
                      />
                    ))}
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5 }}>
                    <Typography variant="body2" color="text.secondary">Custom:</Typography>
                    <input
                      type="color"
                      value={sidebarColor}
                      onChange={(e) => { setSidebarColor(e.target.value); setDirty(true); }}
                      style={{ width: 40, height: 32, border: "none", cursor: "pointer", borderRadius: 4 }}
                    />
                    <Typography variant="body2" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
                      {sidebarColor}
                    </Typography>
                  </Box>
                </Box>

                <Divider />

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Logo
                  </Typography>
                  {sidebarLogoUrl ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <Box
                        sx={{
                          width: 160,
                          height: 48,
                          bgcolor: sidebarColor,
                          borderRadius: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          p: 1,
                        }}
                      >
                        <Box component="img" src={sidebarLogoUrl} alt="Logo" sx={{ maxHeight: 32, maxWidth: 140, objectFit: "contain" }} />
                      </Box>
                      <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={removeLogo}>
                        Remove
                      </Button>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.disabled" sx={{ mb: 1 }}>
                      Using default EstateKit logo
                    </Typography>
                  )}
                  <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={handleLogoUpload} />
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<CloudUploadIcon />}
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploading}
                    sx={{ mt: 1 }}
                  >
                    {uploading ? "Uploading..." : "Upload logo"}
                  </Button>
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
              <Card variant="outlined" sx={{ mb: 3 }}>
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Ad spend
                  </Typography>

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
                </CardContent>
              </Card>
            )}

            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
              fullWidth
              sx={{ mb: 2 }}
            >
              Save changes
            </Button>

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
