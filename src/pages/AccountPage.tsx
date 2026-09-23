import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Skeleton,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import AgentPasswords from "../components/AgentPasswords";
import AddIcon from "@mui/icons-material/Add";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { getMyProfile, upsertProfile, type AgentProfile } from "../api/agentProfile";
import { panicStopAutomations } from "../api/automations";
import { useIsOperator } from "../hooks/useAutomations";
import { useSnack } from "../hooks/useSnack";
import AccountSwitcher from "../components/AccountSwitcher";
import { supabase, getActiveAgentIdSync } from "../api/_client";
import { tokens } from "../theme";

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const showSnack = useSnack();
  const { data: isOperator } = useIsOperator();
  const isDesktop = useMediaQuery("(min-width:900px)");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["myProfile"],
    queryFn: getMyProfile,
    enabled: !!user,
  });

  const [saveState, setSaveState] = useState<"" | "saving" | "saved" | "error">("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [stopping, setStopping] = useState(false);
  async function emergencyStop() {
    setStopping(true);
    try {
      const { cancelled } = await panicStopAutomations();
      showSnack(`Automations stopped — ${cancelled} queued message${cancelled === 1 ? "" : "s"} cancelled`);
    } catch (e) {
      console.error(e);
      showSnack("Couldn't stop automations. Try again.");
    } finally {
      setStopping(false);
    }
  }

  const [form, setForm] = useState({
    displayName: "",
    email: "",
    whatsappNumber: "",
    area: "",
    company: "",
    renewalDate: "",
    sidebarColor: "#111827",
    sidebarLogoUrl: null as string | null,
    avatarUrl: null as string | null,
    fbPageId: "",
    fbAdAccountId: "",
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
        avatarUrl: profile.avatarUrl,
        fbPageId: profile.fbPageId ?? "",
        fbAdAccountId: profile.fbAdAccountId ?? "",
      });
    }
  }, [profile]);

  // Reflect a patch into the shared ["myProfile"] cache immediately — every
  // consumer (sidebar rail, account switcher) re-renders with the new color/
  // logo right away, before the network write even starts. No reload needed.
  const applyOptimistic = useCallback(
    (patch: Partial<AgentProfile>) => {
      queryClient.setQueryData(["myProfile"], (old: AgentProfile | null | undefined) =>
        old ? { ...old, ...patch } : old);
    },
    [queryClient],
  );

  const autosave = useCallback(
    (patch: Partial<typeof form>) => {
      const next = { ...form, ...patch };
      setForm(next);
      applyOptimistic(patch);
      // Bind the write to the profile currently shown, captured now — so it
      // can't land on a different row if the active agent changes before the
      // debounce fires. Only the changed field(s) are sent — sending the
      // whole form here used to smuggle in stale/empty values (e.g. an empty
      // renewalDate) on every keystroke and 400 the write.
      const targetId = profile?.agentId;
      setSaveState("saving");
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await upsertProfile(patch, targetId);
          await queryClient.invalidateQueries({ queryKey: ["myProfile"] });
          setSaveState("saved");
        } catch (e) {
          setSaveState("error");
          console.error(e);
          showSnack("Couldn't save. Try again.");
          // Optimistic patch was wrong — pull back the real, saved values.
          queryClient.invalidateQueries({ queryKey: ["myProfile"] });
        }
      }, 600);
    },
    [form, profile?.agentId, queryClient, applyOptimistic, showSnack],
  );

  function update(field: keyof typeof form, value: string | null) {
    autosave({ [field]: value });
  }

  async function onLogoUpload(file: File | null) {
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) { showSnack("Image must be under 2 MB"); return; }
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/logo-${Date.now()}.${ext}`;
    const prevLogo = form.sidebarLogoUrl;
    // Show the picked file immediately (a blob: URL renders fine everywhere
    // in this page, sidebar included) while the real upload happens in the
    // background — no waiting to *see* the change take effect.
    const previewUrl = URL.createObjectURL(file);
    setForm((f) => ({ ...f, sidebarLogoUrl: previewUrl }));
    applyOptimistic({ sidebarLogoUrl: previewUrl });
    setLogoUploading(true);
    try {
      const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
      await upsertProfile({ sidebarLogoUrl: urlData.publicUrl }, profile?.agentId);
      setForm((f) => ({ ...f, sidebarLogoUrl: urlData.publicUrl }));
      applyOptimistic({ sidebarLogoUrl: urlData.publicUrl });
      await queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      showSnack("Logo uploaded");
    } catch (e) {
      setForm((f) => ({ ...f, sidebarLogoUrl: prevLogo }));
      applyOptimistic({ sidebarLogoUrl: prevLogo });
      console.error(e);
      showSnack("Couldn't upload the logo. Try again.");
    } finally {
      setLogoUploading(false);
      setTimeout(() => URL.revokeObjectURL(previewUrl), 3000);
    }
  }

  // Same flow as the logo, but writes avatar_url. Separate on purpose: the
  // sidebar logo is the agency brand, this is the person — using one field for
  // both meant a client photo sat where a real logo belonged.
  async function onAvatarUpload(file: File | null) {
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) { showSnack("Image must be under 2 MB"); return; }
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const prev = form.avatarUrl;
    const previewUrl = URL.createObjectURL(file);
    setForm((f) => ({ ...f, avatarUrl: previewUrl }));
    setAvatarUploading(true);
    try {
      const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
      await upsertProfile({ avatarUrl: urlData.publicUrl }, profile?.agentId);
      setForm((f) => ({ ...f, avatarUrl: urlData.publicUrl }));
      await queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      await queryClient.invalidateQueries({ queryKey: ["agentProfiles"] });
      showSnack("Photo uploaded");
    } catch (e) {
      setForm((f) => ({ ...f, avatarUrl: prev }));
      console.error(e);
      showSnack("Couldn't upload the photo. Try again.");
    } finally {
      setAvatarUploading(false);
      setTimeout(() => URL.revokeObjectURL(previewUrl), 3000);
    }
  }

  async function onAvatarRemove() {
    const prev = form.avatarUrl;
    setForm((f) => ({ ...f, avatarUrl: null }));
    try {
      await upsertProfile({ avatarUrl: null }, profile?.agentId);
      await queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      await queryClient.invalidateQueries({ queryKey: ["agentProfiles"] });
      showSnack("Photo removed");
    } catch (e) {
      setForm((f) => ({ ...f, avatarUrl: prev }));
      console.error(e);
      showSnack("Couldn't remove the photo. Try again.");
    }
  }

  async function onLogoRemove() {
    const prevLogo = form.sidebarLogoUrl;
    setForm((f) => ({ ...f, sidebarLogoUrl: null }));
    applyOptimistic({ sidebarLogoUrl: null });
    try {
      await upsertProfile({ sidebarLogoUrl: null }, profile?.agentId);
      await queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      showSnack("Logo removed");
    } catch (e) {
      setForm((f) => ({ ...f, sidebarLogoUrl: prevLogo }));
      applyOptimistic({ sidebarLogoUrl: prevLogo });
      console.error(e);
      showSnack("Couldn't remove the logo. Try again.");
    }
  }

  async function onContractUpload(file: File | null) {
    if (!file || !user) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) { showSnack("Only PDF files are allowed"); return; }
    if (file.size > 10 * 1024 * 1024) { showSnack("File must be under 10 MB"); return; }
    const agentId = getActiveAgentIdSync() || user.id;
    const path = `${agentId}/contract-${Date.now()}.pdf`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (error) { console.error(error); showSnack("Couldn't upload the contract. Try again."); return; }
    const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
    await upsertProfile({ contractPdfUrl: urlData.publicUrl }, profile?.agentId);
    queryClient.invalidateQueries({ queryKey: ["myProfile"] });
    showSnack("Contract uploaded");
  }

  if (!user) return null;

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500, flex: 1 }}>Account</Typography>
          {saveState && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, fontSize: 13 }}>
              {saveState === "saving" && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Saving…</Typography>}
              {saveState === "saved" && <Typography sx={{ fontSize: 13, color: "success.main", display: "flex", alignItems: "center", gap: 0.5 }}><CheckIcon sx={{ fontSize: 17 }} /> Saved</Typography>}
              {saveState === "error" && <Typography sx={{ fontSize: 13, color: "error.main" }}>Couldn't save — retry</Typography>}
            </Box>
          )}
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 520, mx: "auto", mt: 3, px: 2, pb: 6 }}>
        {isLoading ? (
          <Skeleton variant="rounded" height={400} sx={{ borderRadius: "8px" }} />
        ) : (
          <>
            {isOperator && !isDesktop && (
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
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Sidebar
                  </Typography>
                  {/* Changes here apply live (color/logo update the real sidebar
                      instantly) — this just confirms the write landed. */}
                  {saveState === "saving" && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <CircularProgress size={13} thickness={5} />
                      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Saving…</Typography>
                    </Box>
                  )}
                  {saveState === "saved" && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <CheckIcon sx={{ fontSize: 15, color: "success.main" }} />
                      <Typography sx={{ fontSize: 12, color: "success.main" }}>Saved</Typography>
                    </Box>
                  )}
                  {saveState === "error" && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <ErrorOutlineIcon sx={{ fontSize: 15, color: "error.main" }} />
                      <Typography sx={{ fontSize: 12, color: "error.main" }}>Couldn't save</Typography>
                    </Box>
                  )}
                </Box>

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
                      transition: "transform 0.1s",
                      "&:active": { transform: "scale(0.92)" },
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
                  <Typography sx={{ fontSize: 11.5, color: "text.disabled", mb: 1, mt: -0.5 }}>
                    The agency or brand mark shown at the top of the sidebar.
                  </Typography>
                  <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                    <Box sx={{ position: "relative" }}>
                      <Box
                        component="label"
                        sx={{
                          width: 64, height: 64, borderRadius: "8px",
                          border: `2px dashed ${form.sidebarLogoUrl ? tokens.primary : tokens.divider}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: logoUploading ? "default" : "pointer", overflow: "hidden",
                          bgcolor: form.sidebarLogoUrl ? form.sidebarColor : tokens.bg,
                          opacity: logoUploading ? 0.5 : 1,
                          "&:hover": logoUploading ? undefined : { borderColor: tokens.primary },
                        }}
                      >
                        {form.sidebarLogoUrl ? (
                          <Box component="img" src={form.sidebarLogoUrl} alt="" sx={{ width: "100%", height: "100%", objectFit: "contain", p: 0.5 }} />
                        ) : (
                          <AddIcon sx={{ fontSize: 20, color: "text.disabled" }} />
                        )}
                        <input type="file" hidden accept="image/*" disabled={logoUploading} onChange={(e) => onLogoUpload(e.target.files?.[0] ?? null)} />
                      </Box>
                      {logoUploading && (
                        <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <CircularProgress size={22} thickness={5} />
                        </Box>
                      )}
                      {form.sidebarLogoUrl && !logoUploading && (
                        <IconButton
                          size="small"
                          onClick={onLogoRemove}
                          sx={{ position: "absolute", top: -8, right: -8, width: 20, height: 20, bgcolor: "#e0e0e0", "&:hover": { bgcolor: "#bdbdbd" } }}
                        >
                          <CloseIcon sx={{ fontSize: 12 }} />
                        </IconButton>
                      )}
                    </Box>
                    <Typography sx={{ fontSize: 12, color: logoUploading ? "text.secondary" : "text.secondary" }}>
                      {logoUploading ? "Uploading…" : form.sidebarLogoUrl ? "Click to replace" : "Upload your logo"}
                    </Typography>
                  </Box>
                </Box>

                {/* Separate from the logo so a real agency mark can live above
                    while the account still has a face. Round, because that is
                    what it is — a photo of a person, not a brand. */}
                <Box>
                  <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>Profile photo</Typography>
                  <Typography sx={{ fontSize: 11.5, color: "text.disabled", mb: 1, mt: -0.5 }}>
                    The agent&apos;s face. Shown next to their name in the account switcher.
                  </Typography>
                  <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                    <Box sx={{ position: "relative" }}>
                      <Box
                        component="label"
                        sx={{
                          width: 64, height: 64, borderRadius: "50%",
                          border: `2px dashed ${form.avatarUrl ? tokens.primary : tokens.divider}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: avatarUploading ? "default" : "pointer", overflow: "hidden",
                          bgcolor: tokens.bg,
                          opacity: avatarUploading ? 0.5 : 1,
                          "&:hover": avatarUploading ? undefined : { borderColor: tokens.primary },
                        }}
                      >
                        {form.avatarUrl ? (
                          <Box component="img" src={form.avatarUrl} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <AddIcon sx={{ fontSize: 20, color: "text.disabled" }} />
                        )}
                        <input type="file" hidden accept="image/*" disabled={avatarUploading} onChange={(e) => onAvatarUpload(e.target.files?.[0] ?? null)} />
                      </Box>
                      {avatarUploading && (
                        <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <CircularProgress size={22} thickness={5} />
                        </Box>
                      )}
                      {form.avatarUrl && !avatarUploading && (
                        <IconButton
                          size="small"
                          onClick={onAvatarRemove}
                          sx={{ position: "absolute", top: -4, right: -4, width: 20, height: 20, bgcolor: "#e0e0e0", "&:hover": { bgcolor: "#bdbdbd" } }}
                        >
                          <CloseIcon sx={{ fontSize: 12 }} />
                        </IconButton>
                      )}
                    </Box>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                      {avatarUploading ? "Uploading…" : form.avatarUrl ? "Click to replace" : "Upload a photo"}
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

                {isOperator && (
                  <TextField
                    label="Renewal date"
                    type="date"
                    value={form.renewalDate}
                    onChange={(e) => update("renewalDate", e.target.value)}
                    fullWidth
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                )}

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
                  {isOperator && (
                    <Button
                      component="label"
                      variant="outlined"
                      size="small"
                      startIcon={<UploadFileIcon />}
                      sx={{ mt: 1 }}
                    >
                      {profile?.contractPdfUrl ? "Replace PDF" : "Upload PDF"}
                      <input type="file" hidden accept=".pdf,application/pdf" onChange={(e) => onContractUpload(e.target.files?.[0] ?? null)} />
                    </Button>
                  )}
                </Box>
              </CardContent>
            </Card>

            {isOperator && (
              <Card variant="outlined" sx={{ mb: 3 }}>
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Facebook
                  </Typography>
                  <TextField
                    label="FB Page ID"
                    value={form.fbPageId}
                    onChange={(e) => update("fbPageId", e.target.value)}
                    fullWidth
                    placeholder="e.g. 102676318479700"
                  />
                  <TextField
                    label="FB Ad Account ID"
                    value={form.fbAdAccountId}
                    onChange={(e) => update("fbAdAccountId", e.target.value)}
                    fullWidth
                    placeholder="e.g. 1913367189267353"
                  />
                </CardContent>
              </Card>
            )}

            {isOperator && (
              <Card variant="outlined" sx={{ mb: 3 }}>
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Agent logins
                  </Typography>
                  <AgentPasswords onSnack={showSnack} />
                </CardContent>
              </Card>
            )}

            {isOperator && (
              <Card variant="outlined" sx={{ mb: 3, borderColor: "#fca5a5" }}>
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, color: "#b91c1c" }}>
                    Emergency stop
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    Instantly turns off all automations and cancels every queued message across all accounts.
                  </Typography>
                  <Button
                    variant="contained"
                    color="error"
                    onClick={emergencyStop}
                    disabled={stopping}
                    fullWidth
                  >
                    {stopping ? "Stopping…" : "Stop all automations"}
                  </Button>
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
