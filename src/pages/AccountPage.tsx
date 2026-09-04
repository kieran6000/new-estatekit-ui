import { useEffect, useState } from "react";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { getMyProfile, upsertProfile } from "../api/agentProfile";
import { useIsOperator } from "../hooks/useAutomations";
import { useSnack } from "../hooks/useSnack";

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const showSnack = useSnack();
  const { data: isOperator } = useIsOperator();

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
  const [dirty, setDirty] = useState(false);

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
      setDirty(false);
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: () => upsertProfile(form),
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
