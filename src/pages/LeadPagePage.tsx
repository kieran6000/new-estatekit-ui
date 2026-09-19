import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
  FormControlLabel,
  Skeleton,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
} from "@mui/material";
import FacebookIcon from "@mui/icons-material/Facebook";
import LanguageIcon from "@mui/icons-material/Language";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ShareIcon from "@mui/icons-material/Share";
import LockIcon from "@mui/icons-material/Lock";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PlaceIcon from "@mui/icons-material/PlaceOutlined";
import { usePostHog } from "@posthog/react";
import { tokens } from "../theme";
import { PIPELINE_KIND_LABEL, type CustomQuestion, type LeadPage, type Pipeline, type PipelineKind, type QuestionType } from "../types";
import { useAddLeadPage, useDeleteLeadPage, useLeadPages, useUpdateLeadPage } from "../hooks/useLeadPages";
import { usePipelines } from "../hooks/usePipelines";
import { getFbForm, listFbForms, type FbForm } from "../api/leadPages";
import FbFormPreview from "../components/FbFormPreview";
import { getMyProfile } from "../api/agentProfile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, getActiveAgentIdSync } from "../api/_client";
import { listMySoldListings, addSoldListing, deleteSoldListing, type SoldListingStatus } from "../api/soldListings";
import { trackActivity } from "../lib/activity";
import {
  useAddCustomQuestion,
  useCustomQuestions,
  useMoveCustomQuestion,
  useRemoveCustomQuestion,
  useUpdateCustomQuestion,
} from "../hooks/useCustomQuestions";
import { useTier } from "../hooks/useTier";
import { useIsOperator } from "../hooks/useAutomations";
import { useSnack } from "../hooks/useSnack";
import LeadCaptureForm from "../components/LeadCaptureForm";
import LeadPageFunnelStats from "../components/LeadPageFunnelStats";
import { getCapiConfig, saveCapiConfig, listCapiEvents } from "../api/capi";
import { timeAgo } from "../lib/timeAgo";

export default function LeadPagePage() {
  const navigate = useNavigate();
  const { tier } = useTier();
  const { data: isOperator } = useIsOperator();
  const { data: pages = [], isLoading: pagesLoading } = useLeadPages();
  const { data: pipelines = [], isLoading: pipelinesLoading } = usePipelines();
  const { data: profile } = useQuery({ queryKey: ["myProfile"], queryFn: getMyProfile, staleTime: 5 * 60_000 });
  const updatePage = useUpdateLeadPage();
  const deletePage = useDeleteLeadPage();
  const showSnack = useSnack();
  const posthog = usePostHog();

  const [pageId, setPageId] = useState<string | null>(null);
  const [pageMenuAnchor, setPageMenuAnchor] = useState<HTMLElement | null>(null);
  const [addPageOpen, setAddPageOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [renameDialogId, setRenameDialogId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const page: LeadPage | undefined = pages.find((p) => p.id === pageId) ?? pages[0];
  const pipeline: Pipeline | undefined = pipelines.find((p) => p.id === page?.pipelineId);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [form, setForm] = useState({
    agentName: "", headline: "", suburb: "", phone: "",
    nameLabel: "", phoneLabel: "", ctaLabel: "",
    thankYouHeadline: "", thankYouSubtext: "", fbPixelId: "",
  });

  useEffect(() => {
    if (page) {
      setForm({
        agentName: page.agentName, headline: page.headline, suburb: page.suburb, phone: page.phone,
        nameLabel: page.nameLabel, phoneLabel: page.phoneLabel, ctaLabel: page.ctaLabel,
        thankYouHeadline: page.thankYouHeadline, thankYouSubtext: page.thankYouSubtext, fbPixelId: page.fbPixelId,
      });
    }
  }, [page?.id]);

  const debouncedUpdate = useCallback(
    (patch: Partial<Omit<LeadPage, "id" | "pipelineId">>) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updatePage.mutate({ id: page!.id, patch });
      }, 600);
    },
    [page?.id, updatePage],
  );

  function fieldChange(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    debouncedUpdate({ [field]: value });
  }

  if (pagesLoading || pipelinesLoading) return <LeadPagePageSkeleton />;
  if (!page || !pipeline) return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>My Page</Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ maxWidth: 460, mx: "auto", mt: 6, px: 2, textAlign: "center" }}>
        <Typography sx={{ fontSize: 16, fontWeight: 600, mb: 1 }}>No lead sources yet</Typography>
        <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 3 }}>
          Create a lead page or connect a Facebook instant form to start capturing leads.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddPageOpen(true)}>
          Add lead source
        </Button>
      </Box>
      <AddPageDialog
        open={addPageOpen}
        pipelines={pipelines}
        fbPageId={profile?.fbPageId || null}
        onClose={() => setAddPageOpen(false)}
        onCreated={(id) => {
          setPageId(id);
          showSnack("Page created");
        }}
      />
    </Box>
  );

  function update(patch: Partial<Omit<LeadPage, "id" | "pipelineId">>) {
    updatePage.mutate({ id: page!.id, patch });
  }

  function onLogoChange(file: File | null) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showSnack("Image must be under 2 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => { update({ logoDataUrl: reader.result as string }); showSnack("Logo uploaded"); };
    reader.readAsDataURL(file);
  }

  function onPhotoChange(file: File | null) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showSnack("Image must be under 2 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => { update({ profilePhotoDataUrl: reader.result as string }); showSnack("Profile photo uploaded"); };
    reader.readAsDataURL(file);
  }

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>My Page</Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, p: "10px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Box
          component="button"
          onClick={(e) => setPageMenuAnchor(e.currentTarget)}
          sx={{ display: "flex", alignItems: "center", gap: 0.25, border: `1px solid ${tokens.divider}`, borderRadius: "4px", bgcolor: tokens.surface, fontSize: 13, fontWeight: 500, p: "7px 6px 7px 12px", cursor: "pointer" }}
        >
          {page.name} <ArrowDropDownIcon fontSize="small" />
        </Box>
        <Menu anchorEl={pageMenuAnchor} open={!!pageMenuAnchor} onClose={() => setPageMenuAnchor(null)}>
          {pages.map((p) => (
            <MenuItem
              key={p.id}
              onClick={() => {
                setPageId(p.id);
                setPageMenuAnchor(null);
              }}
              sx={{ display: "flex", alignItems: "center", gap: 1 }}
            >
              {p.sourceType === "fb_form" ? <FacebookIcon sx={{ fontSize: 16, color: "#1877f2" }} /> : <LanguageIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
              <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</Box>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setPageMenuAnchor(null);
                  setRenameDraft(p.name);
                  setRenameDialogId(p.id);
                }}
                sx={{ ml: 0.5, p: 0.5 }}
              >
                <EditOutlinedIcon sx={{ fontSize: 15 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setPageMenuAnchor(null);
                  setDeleteConfirmId(p.id);
                }}
                sx={{ p: 0.5 }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </MenuItem>
          ))}
          <MenuItem
            onClick={() => {
              setPageMenuAnchor(null);
              setAddPageOpen(true);
            }}
            sx={{ color: tokens.primary, borderTop: `1px solid ${tokens.divider2}`, mt: 0.5 }}
          >
            + Add page
          </MenuItem>
        </Menu>
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
          Sends leads to <b style={{ color: tokens.ink }}>{pipeline.name}</b> pipeline
        </Typography>
      </Box>

      {page.sourceType === "fb_form" ? (
        <FbFormSource
          page={page}
          pipelineName={pipeline.name}
          fbPageId={profile?.fbPageId || null}
          pageName={[profile?.displayName, profile?.company].filter(Boolean).join(" - ") || page.fbFormName || page.name}
          avatarUrl={profile?.sidebarLogoUrl || null}
        />
      ) : (
        <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3, p: 2, maxWidth: 1100, mx: "auto" }}>
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <Section title="Page details">
              <TextField label="Agent name" value={form.agentName} onChange={(e) => fieldChange("agentName", e.target.value)} fullWidth />
              <TextField label="Headline" value={form.headline} onChange={(e) => fieldChange("headline", e.target.value)} fullWidth multiline minRows={2} />
              <TextField label="Suburb / area" value={form.suburb} onChange={(e) => fieldChange("suburb", e.target.value)} fullWidth />
              <TextField label="Phone" value={form.phone} onChange={(e) => fieldChange("phone", e.target.value)} fullWidth />
              <Box sx={{ display: "flex", gap: 2 }}>
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75 }}>
                  <Box sx={{ position: "relative" }}>
                    <Box
                      component="label"
                      sx={{
                        width: 64, height: 64, borderRadius: "8px", border: `2px dashed ${page.logoDataUrl ? tokens.primary : tokens.divider}`,
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden",
                        bgcolor: page.logoDataUrl ? "transparent" : tokens.bg,
                        "&:hover": { borderColor: tokens.primary },
                      }}
                    >
                      {page.logoDataUrl ? (
                        <Box component="img" src={page.logoDataUrl} alt="" sx={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      ) : (
                        <AddIcon sx={{ fontSize: 20, color: "text.disabled" }} />
                      )}
                      <input type="file" hidden accept="image/*" onChange={(e) => onLogoChange(e.target.files?.[0] ?? null)} />
                    </Box>
                    {page.logoDataUrl && (
                      <IconButton size="small" onClick={() => { update({ logoDataUrl: null }); showSnack("Logo removed"); }}
                        sx={{ position: "absolute", top: -8, right: -8, width: 20, height: 20, bgcolor: "#e0e0e0", "&:hover": { bgcolor: "#bdbdbd" } }}>
                        <CloseIcon sx={{ fontSize: 12 }} />
                      </IconButton>
                    )}
                  </Box>
                  <Typography sx={{ fontSize: 11, color: "text.secondary" }}>Logo</Typography>
                </Box>
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75 }}>
                  <Box sx={{ position: "relative" }}>
                    <Box
                      component="label"
                      sx={{
                        width: 64, height: 64, borderRadius: "50%", border: `2px dashed ${page.profilePhotoDataUrl ? tokens.primary : tokens.divider}`,
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden",
                        bgcolor: page.profilePhotoDataUrl ? "transparent" : tokens.bg,
                        "&:hover": { borderColor: tokens.primary },
                      }}
                    >
                      {page.profilePhotoDataUrl ? (
                        <Box component="img" src={page.profilePhotoDataUrl} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <AddIcon sx={{ fontSize: 20, color: "text.disabled" }} />
                      )}
                      <input type="file" hidden accept="image/*" onChange={(e) => onPhotoChange(e.target.files?.[0] ?? null)} />
                    </Box>
                    {page.profilePhotoDataUrl && (
                      <IconButton size="small" onClick={() => { update({ profilePhotoDataUrl: null }); showSnack("Photo removed"); }}
                        sx={{ position: "absolute", top: -4, right: -4, width: 20, height: 20, bgcolor: "#e0e0e0", "&:hover": { bgcolor: "#bdbdbd" } }}>
                        <CloseIcon sx={{ fontSize: 12 }} />
                      </IconButton>
                    )}
                  </Box>
                  <Typography sx={{ fontSize: 11, color: "text.secondary" }}>Profile photo</Typography>
                </Box>
              </Box>
              <Typography sx={{ fontSize: 12, color: "text.secondary", mt: -1 }}>
                Logo shows in the page header. Profile photo shows on the thank-you screen.
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
                    bgcolor: page.accentColor,
                    outline: `1px solid ${tokens.divider}`,
                    cursor: "pointer",
                    display: "block",
                    overflow: "hidden",
                  }}
                >
                  <input
                    type="color"
                    value={page.accentColor}
                    onChange={(e) => update({ accentColor: e.target.value })}
                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", border: 0, padding: 0 }}
                  />
                </Box>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 500 }}>Show intro screen</Typography>
                  <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Headline + Get Started, before Step 1</Typography>
                </Box>
                <Switch checked={page.showIntro} onChange={(e) => update({ showIntro: e.target.checked })} />
              </Box>
            </Section>

            <Section title="Submit &amp; thank you">
              <TextField label="Submit button text" value={form.ctaLabel} onChange={(e) => fieldChange("ctaLabel", e.target.value)} fullWidth />
              <TextField
                label="Thank-you headline"
                value={form.thankYouHeadline}
                onChange={(e) => fieldChange("thankYouHeadline", e.target.value)}
                helperText="{name} is replaced with what they typed"
                fullWidth
              />
              <TextField label="Thank-you subtext" value={form.thankYouSubtext} onChange={(e) => fieldChange("thankYouSubtext", e.target.value)} fullWidth multiline minRows={2} />
            </Section>

            {isOperator && (
              <Section title="Tracking">
                <TextField
                  label="Facebook Pixel ID"
                  placeholder="Paste pixel ID or the full code snippet from Facebook"
                  value={form.fbPixelId}
                  onChange={(e) => {
                    let val = e.target.value;
                    const match = val.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]\s*\)/);
                    if (match) val = match[1];
                    fieldChange("fbPixelId", val);
                  }}
                  helperText="Paste just the ID (e.g. 1234567890123456) or the full pixel code — we'll extract the ID automatically"
                  fullWidth
                  multiline
                  minRows={1}
                  maxRows={3}
                />

                {/* Everything below is off by default and stays collapsed.
                    Nobody needs it to run a page, and a wall of tracking
                    options is how a simple screen turns confusing. */}
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 0.5 }}>
                  <Box>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>Advanced tracking</Typography>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                      Server-side conversions. Leave off unless you're setting it up.
                    </Typography>
                  </Box>
                  <Switch size="small" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} />
                </Box>

                {showAdvanced && <CapiSettings pixelId={form.fbPixelId} />}
              </Section>
            )}

            <Section title="Form questions">
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                Name and phone are always collected last. Email is optional (toggle below). Every other
                question — including the address and timeline ones every page starts with — can be edited, reordered or removed.
              </Typography>
              <TextField label="Name field question" value={form.nameLabel} onChange={(e) => fieldChange("nameLabel", e.target.value)} fullWidth />
              <TextField label="Phone field question" value={form.phoneLabel} onChange={(e) => fieldChange("phoneLabel", e.target.value)} fullWidth />
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 500 }}>Ask for email address</Typography>
                  <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Turn off to collect only name + phone</Typography>
                </Box>
                <Switch checked={page.collectEmail} onChange={(e) => update({ collectEmail: e.target.checked })} />
              </Box>

              <CustomQuestionEditor pageId={page.id} tier={tier} onUpgrade={() => {
                posthog.capture("upgrade_clicked", { source: "lead_page_custom_questions" });
                navigate("/upgrade");
              }} />
            </Section>

            {isOperator && (
              <Section title="Recent sales (social proof)">
                <RecentSalesEditor />
              </Section>
            )}
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, alignSelf: "flex-start", position: { md: "sticky" }, top: { md: 72 } }}>
            <Section
              title="Live preview"
              action={
                <Typography
                  component="a"
                  href={`/p/${page.slug}`}
                  target="_blank"
                  rel="noopener"
                  sx={{ display: "flex", alignItems: "center", gap: 0.4, fontSize: 12.5, color: tokens.primary, textDecoration: "none", textTransform: "none", fontWeight: 500, "&:hover": { textDecoration: "underline" } }}
                >
                  Open live preview <OpenInNewIcon sx={{ fontSize: 14 }} />
                </Typography>
              }
            >
              <PreviewAndSubmit page={{ ...page, ...form }} pipelineKind={pipeline.kind} />
            </Section>

            {isOperator && <LeadPageFunnelStats pageId={page.id} />}

            <ShareSection page={page} onUpdateSlug={(slug) => updatePage.mutate({ id: page.id, patch: { slug } })} />
          </Box>
        </Box>
      )}

      <AddPageDialog
        open={addPageOpen}
        pipelines={pipelines}
        fbPageId={profile?.fbPageId || null}
        onClose={() => setAddPageOpen(false)}
        onCreated={(id) => {
          setPageId(id);
          showSnack("Page created");
        }}
      />

      <Dialog open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 600 }}>Delete this page?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            This will permanently remove the page and its URL. Leads already captured won't be affected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              if (!deleteConfirmId) return;
              await deletePage.mutateAsync(deleteConfirmId);
              if (pageId === deleteConfirmId) setPageId(null);
              setDeleteConfirmId(null);
              showSnack("Page deleted");
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!renameDialogId} onClose={() => setRenameDialogId(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 600 }}>Rename page</DialogTitle>
        <DialogContent>
          <TextField
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            fullWidth
            autoFocus
            label="Page name"
            sx={{ mt: 1 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameDraft.trim() && renameDialogId) {
                updatePage.mutate({ id: renameDialogId, patch: { name: renameDraft.trim() } });
                setRenameDialogId(null);
                showSnack("Page renamed");
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogId(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!renameDraft.trim()}
            onClick={() => {
              if (renameDialogId && renameDraft.trim()) {
                updatePage.mutate({ id: renameDialogId, patch: { name: renameDraft.trim() } });
                setRenameDialogId(null);
                showSnack("Page renamed");
              }
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function FbFormSource({
  page,
  pipelineName,
  fbPageId,
  pageName,
  avatarUrl,
}: {
  page: LeadPage;
  pipelineName: string;
  fbPageId: string | null;
  pageName: string;
  avatarUrl: string | null;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["fbForm", page.fbFormId],
    queryFn: () => getFbForm(fbPageId, page.fbFormId!),
    enabled: !!page.fbFormId,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const form = data?.form;
  const fbName = data?.page?.name || pageName;
  const fbAvatar = data?.page?.picture || avatarUrl;

  const CONTACT = new Set(["FULL_NAME", "EMAIL", "PHONE", "FIRST_NAME", "LAST_NAME", "STREET_ADDRESS", "CITY", "ZIP", "COUNTRY", "PROVINCE", "STATE"]);

  return (
    <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3, p: 2, maxWidth: 1000, mx: "auto", alignItems: "flex-start" }}>
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
        <Section title="Form questions">
          {isLoading ? (
            <Skeleton variant="rounded" height={160} sx={{ borderRadius: "8px" }} />
          ) : error || data?.noAccess ? (
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              {data?.noAccess
                ? "EstateKit doesn't have access to this Facebook page, so the form's questions can't be shown."
                : "Couldn't load this form from Facebook right now. Try again in a minute."}
            </Typography>
          ) : form ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {form.questions.map((q, idx) => (
                <Box key={q.id || q.key} sx={{ display: "flex", gap: 1.25, p: "10px 12px", border: `1px solid ${tokens.divider}`, borderRadius: "6px" }}>
                  <Typography sx={{ fontSize: 13, color: "text.disabled", fontWeight: 600, minWidth: 18 }}>{idx + 1}</Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{q.label}</Typography>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                      {CONTACT.has(q.type)
                        ? "Contact detail"
                        : q.options?.length
                          ? `Choice — ${q.options.map((o) => o.value).join(", ")}`
                          : "Short answer"}
                    </Typography>
                  </Box>
                </Box>
              ))}
              <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>
                Questions are managed in Facebook Ads Manager. Edit them there and they'll update here.
              </Typography>
            </Box>
          ) : null}
        </Section>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, width: "100%", alignSelf: { md: "flex-start" }, position: { md: "sticky" }, top: { md: 72 } }}>
        <Section title="Live preview">
          {isLoading ? (
            <Skeleton variant="rounded" height={620} sx={{ borderRadius: "12px" }} />
          ) : form ? (
            <FbFormPreview
              form={form}
              pageName={fbName}
              avatarUrl={fbAvatar}
              formName={form.name || page.fbFormName || page.name}
              pipelineName={pipelineName}
            />
          ) : (
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              Preview unavailable — couldn't load the form from Facebook.
            </Typography>
          )}
        </Section>
      </Box>
    </Box>
  );
}

function PreviewAndSubmit({ page, pipelineKind }: { page: LeadPage; pipelineKind: PipelineKind }) {
  const { data: customQuestions = [] } = useCustomQuestions(page.id);
  const showSnack = useSnack();
  return (
    // Preview only: filling this in on the dashboard must never create a lead
    // or fire tracking — it's the agent checking their own form.
    <LeadCaptureForm
      page={page}
      pipelineKind={pipelineKind}
      customQuestions={customQuestions}
      preview
      onSubmit={() => showSnack("Preview only — nothing was saved")}
    />
  );
}

function UpgradeNudge({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: "14px", border: `1px dashed ${tokens.divider}`, borderRadius: "6px" }}>
      <LockIcon sx={{ color: "text.disabled" }} />
      <Typography sx={{ flex: 1, fontSize: 13.5, color: "text.secondary" }}>Add custom questions with paid</Typography>
      <Button size="small" variant="contained" onClick={onUpgrade}>
        Upgrade
      </Button>
    </Box>
  );
}

function ShareSection({ page, onUpdateSlug }: { page: LeadPage; onUpdateSlug: (slug: string) => void }) {
  const showSnack = useSnack();
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState(page.slug);
  const baseUrl = window.location.origin;
  const shareUrl = `${baseUrl}/p/${page.slug}`;

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    showSnack("Link copied");
  }

  async function shareLink() {
    const shareData = { title: page.agentName || page.name, text: page.headline, url: shareUrl };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled the share sheet
      }
    } else {
      copyLink();
      showSnack("Link copied — paste it into WhatsApp or your bio");
    }
  }

  function saveSlug() {
    const clean = slugDraft.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/(^-|-$)/g, "");
    if (clean && clean !== page.slug) {
      onUpdateSlug(clean);
      showSnack("URL updated");
    }
    setEditingSlug(false);
  }

  return (
    <Section title="Start capturing leads">
      <Typography sx={{ fontSize: 13.5, color: "text.secondary", mt: -1 }}>
        Share this link anywhere — every submission lands straight in your Leads tab.
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        {editingSlug ? (
          <TextField
            value={slugDraft}
            onChange={(e) => setSlugDraft(e.target.value)}
            size="small"
            autoFocus
            onBlur={saveSlug}
            onKeyDown={(e) => { if (e.key === "Enter") saveSlug(); if (e.key === "Escape") setEditingSlug(false); }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start" sx={{ mr: 0 }}><Box component="span" sx={{ fontSize: 13, color: "text.disabled" }}>/p/</Box></InputAdornment> } }}
            sx={{ flex: "1 1 180px", minWidth: 0 }}
          />
        ) : (
          <TextField
            value={shareUrl}
            size="small"
            slotProps={{ input: { readOnly: true, sx: { fontSize: 13 } } }}
            onClick={() => { setSlugDraft(page.slug); setEditingSlug(true); }}
            title="Click to edit the link"
            sx={{ flex: "1 1 180px", minWidth: 0, cursor: "pointer" }}
          />
        )}
        <Button variant="outlined" startIcon={<ContentCopyIcon fontSize="small" />} onClick={copyLink} sx={{ flexShrink: 0 }}>
          Copy
        </Button>
      </Box>
      {editingSlug && (
        <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: -0.5 }}>
          Editing the link — press Enter to save. Full link: {baseUrl}/p/{slugDraft || page.slug}
        </Typography>
      )}
      <Button variant="contained" startIcon={<ShareIcon fontSize="small" />} onClick={shareLink} sx={{ alignSelf: "flex-start" }}>
        Share
      </Button>
      <Box sx={{ display: "flex", gap: 1.25, p: "12px 14px", bgcolor: tokens.primaryBg, borderRadius: "6px" }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: tokens.primaryDark, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>
          Tip
        </Typography>
        <Typography sx={{ fontSize: 13, color: tokens.primaryDark }}>
          Post this link to your WhatsApp status or Instagram bio today — it's the fastest way to get your first lead.
        </Typography>
      </Box>
    </Section>
  );
}

function AddPageDialog({
  open,
  pipelines,
  fbPageId,
  onClose,
  onCreated,
}: {
  open: boolean;
  pipelines: Pipeline[];
  fbPageId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [sourceType, setSourceType] = useState<"website" | "fb_form">("website");
  const [name, setName] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [fbForms, setFbForms] = useState<FbForm[]>([]);
  const [fbFormId, setFbFormId] = useState("");
  const [loadingForms, setLoadingForms] = useState(false);
  // Why the form list is empty, when it isn't simply "no forms on the page".
  const [formsProblem, setFormsProblem] = useState<"no_access" | "failed" | null>(null);
  const addPage = useAddLeadPage();
  const posthog = usePostHog();

  useEffect(() => {
    if (open) {
      setName("");
      setSourceType("website");
      setPipelineId(pipelines[0]?.id ?? "");
      setFbForms([]);
      setFbFormId("");
      setFormsProblem(null);
    }
  }, [open, pipelines]);

  useEffect(() => {
    if (sourceType !== "fb_form" || !open) return;
    if (!fbPageId) { setFbForms([]); setFormsProblem(null); return; }
    let cancelled = false;
    (async () => {
      setLoadingForms(true);
      setFormsProblem(null);
      try {
        const { forms, noAccess } = await listFbForms(fbPageId);
        if (!cancelled) {
          setFbForms(forms);
          setFormsProblem(noAccess ? "no_access" : null);
        }
      } catch {
        if (!cancelled) {
          setFbForms([]);
          setFormsProblem("failed");
        }
      }
      if (!cancelled) setLoadingForms(false);
    })();
    return () => { cancelled = true; };
  }, [sourceType, open, fbPageId]);

  const selectedForm = fbForms.find((f) => f.id === fbFormId);

  async function create() {
    const pipeline = pipelines.find((p) => p.id === pipelineId);
    if (!pipeline) return;
    if (sourceType === "website" && !name.trim()) return;
    if (sourceType === "fb_form" && !selectedForm) return;

    const pageName = sourceType === "fb_form" ? (selectedForm?.name || "FB Form") : name.trim();
    const p = await addPage.mutateAsync({
      name: pageName,
      pipelineId: pipeline.id,
      kind: pipeline.kind,
      sourceType,
      fbFormId: selectedForm?.id,
      fbFormName: selectedForm?.name,
    });
    posthog.capture("lead_page_added", { preset: pipeline.kind, sourceType });
    onClose();
    onCreated(p.id);
  }

  const canCreate = sourceType === "website" ? !!name.trim() && !!pipelineId : !!fbFormId && !!pipelineId;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: 18, fontWeight: 500 }}>Add lead source</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 0.5 }}>Source type</Typography>
          <RadioGroup row value={sourceType} onChange={(e) => setSourceType(e.target.value as "website" | "fb_form")}>
            <FormControlLabel value="website" control={<Radio />} label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <LanguageIcon sx={{ fontSize: 16 }} /> Lead page
              </Box>
            } />
            <FormControlLabel value="fb_form" control={<Radio />} label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <FacebookIcon sx={{ fontSize: 16, color: "#1877f2" }} /> Instant form
              </Box>
            } />
          </RadioGroup>
        </Box>

        {sourceType === "website" ? (
          <TextField label="Page name" value={name} onChange={(e) => setName(e.target.value)} fullWidth autoFocus />
        ) : (
          <Box>
            {loadingForms ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
                <CircularProgress size={18} />
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Loading forms from Facebook...</Typography>
              </Box>
            ) : fbForms.length > 0 ? (
              <TextField
                select
                label="Select a form"
                value={fbFormId}
                onChange={(e) => setFbFormId(e.target.value)}
                fullWidth
              >
                {fbForms.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {f.name}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <Box sx={{ py: 1 }}>
                <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>
                  {formsProblem === "no_access"
                    ? "EstateKit doesn't have access to this Facebook page's forms yet."
                    : formsProblem === "failed"
                      ? "Couldn't load forms from Facebook. Try again in a minute."
                      : fbPageId
                        ? "No forms found on this Facebook page."
                        : "No Facebook page linked to this account."}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                  onClick={() => window.open(
                    fbPageId
                      ? `https://www.facebook.com/${fbPageId}/publishing_tools/?section=INSTANT_FORMS`
                      : "https://business.facebook.com/latest/leads_center/forms",
                    "_blank"
                  )}
                  sx={{ textTransform: "none", fontSize: 12.5 }}
                >
                  {fbPageId ? "Create a form in Ads Manager" : "Set up in Ads Manager"}
                </Button>
              </Box>
            )}
          </Box>
        )}

        <Box>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 0.5 }}>Which pipeline should this feed?</Typography>
          <RadioGroup value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
            {pipelines.map((p) => (
              <FormControlLabel key={p.id} value={p.id} control={<Radio />} label={`${p.name} (${PIPELINE_KIND_LABEL[p.kind]})`} />
            ))}
          </RadioGroup>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!canCreate} onClick={create}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function LeadPagePageSkeleton() {
  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>My Page</Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3, p: 2, maxWidth: 1100, mx: "auto" }}>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <Skeleton variant="rounded" height={280} sx={{ borderRadius: "8px" }} />
          <Skeleton variant="rounded" height={140} sx={{ borderRadius: "8px" }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Skeleton variant="rounded" height={340} sx={{ borderRadius: "8px" }} />
        </Box>
      </Box>
    </Box>
  );
}

function RecentSalesEditor() {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const { data: listings = [] } = useQuery({ queryKey: ["mySold"], queryFn: listMySoldListings });
  const [address, setAddress] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<SoldListingStatus>("sold");
  const [busy, setBusy] = useState(false);

  async function onImage(file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showSnack("Image must be under 5 MB"); return; }
    if (!address.trim()) { showSnack("Add the address first"); return; }
    setBusy(true);
    try {
      const agentId = getActiveAgentIdSync() || "agent";
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${agentId}/sale-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
      if (error) { console.error(error); showSnack("Couldn't upload the photo. Try again."); setBusy(false); return; }
      const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
      const priceNum = price ? Number(price.replace(/\D/g, "")) : null;
      await addSoldListing({ imageUrl: urlData.publicUrl, address: address.trim(), price: priceNum, status });
      trackActivity("sold_listing_added", { sale: { address: address.trim(), price: priceNum ?? undefined } });
      await qc.invalidateQueries({ queryKey: ["mySold"] });
      await qc.invalidateQueries({ queryKey: ["publicSold"] });
      setAddress("");
      setPrice("");
      setStatus("sold");
      showSnack(status === "sold" ? "Sale added" : "Listing added");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await deleteSoldListing(id);
    await qc.invalidateQueries({ queryKey: ["mySold"] });
    await qc.invalidateQueries({ queryKey: ["publicSold"] });
    showSnack("Removed");
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
        Sold and currently-listed homes shown under the form and on the thank-you page as social proof. Choose sold or listed, add the address and price, then pick a photo.
      </Typography>

      {listings.map((l) => (
        <Box key={l.id} sx={{ display: "flex", alignItems: "center", gap: 1.25, p: "8px 10px", border: `1px solid ${tokens.divider}`, borderRadius: "6px" }}>
          {l.imageUrl && <Box component="img" src={l.imageUrl} alt="" sx={{ width: 48, height: 40, objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Chip
                size="small"
                label={l.status === "sold" ? "Sold" : "Listed"}
                color={l.status === "sold" ? "success" : "primary"}
                variant="outlined"
                sx={{ height: 18, fontSize: 10.5, "& .MuiChip-label": { px: 0.75 } }}
              />
              <Typography sx={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.address}</Typography>
            </Box>
            {l.price != null && (
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                {l.status === "sold" ? "Sold for" : "Listed at"} R{l.price.toLocaleString("en-ZA")}
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={() => remove(l.id)}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: "12px", border: `1px dashed ${tokens.divider}`, borderRadius: "6px" }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={status}
          onChange={(_e, v) => v && setStatus(v)}
          sx={{ alignSelf: "flex-start", "& .MuiToggleButton-root": { textTransform: "none", fontSize: 12.5, px: 1.5, py: 0.5 } }}
        >
          <ToggleButton value="sold">Sold</ToggleButton>
          <ToggleButton value="listed">Listed</ToggleButton>
        </ToggleButtonGroup>
        <TextField label="Address" size="small" value={address} onChange={(e) => setAddress(e.target.value)} fullWidth placeholder="e.g. 12 Protea Drive, Midrand" />
        <TextField
          label={status === "sold" ? "Sold price (R)" : "Listed price (R)"}
          size="small"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
          fullWidth
          placeholder="e.g. 1970000"
          inputMode="numeric"
        />
        <Button component="label" variant="contained" size="small" disabled={busy || !address.trim()} startIcon={busy ? <CircularProgress size={14} /> : <AddIcon fontSize="small" />} sx={{ alignSelf: "flex-start" }}>
          {busy ? "Adding…" : `Add ${status} home (pick photo)`}
          <input type="file" hidden accept="image/*" onChange={(e) => onImage(e.target.files?.[0] ?? null)} />
        </Button>
      </Box>
    </Box>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "short_text", label: "Short text" },
  { value: "address", label: "Address" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "yes_no", label: "Yes / No" },
];

function CustomQuestionEditor({
  pageId,
  tier,
  onUpgrade,
}: {
  pageId: string;
  tier: "free" | "paid";
  onUpgrade: () => void;
}) {
  const { data: questions = [] } = useCustomQuestions(pageId);
  const addQuestion = useAddCustomQuestion(pageId);
  const removeQuestion = useRemoveCustomQuestion(pageId);
  const moveQuestion = useMoveCustomQuestion(pageId);
  const posthog = usePostHog();
  const [label, setLabel] = useState("");
  const [type, setType] = useState<QuestionType>("short_text");
  const [required, setRequired] = useState(false);
  const [optionsText, setOptionsText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function add() {
    if (!label.trim()) return;
    const options = type === "multiple_choice" ? optionsText.split(",").map((o) => o.trim()).filter(Boolean) : undefined;
    await addQuestion.mutateAsync({ label: label.trim(), type, required, options });
    posthog.capture("custom_question_added", { type });
    setLabel("");
    setOptionsText("");
    setRequired(false);
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {questions.map((q, i) =>
        editingId === q.id ? (
          <EditQuestionRow key={q.id} pageId={pageId} question={q} onDone={() => setEditingId(null)} />
        ) : (
          <Box key={q.id} sx={{ display: "flex", alignItems: "center", gap: 1, p: "10px 12px", border: `1px solid ${tokens.divider}`, borderRadius: "6px" }}>
            {q.type === "address" && <PlaceIcon fontSize="small" sx={{ color: "text.secondary" }} />}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
                {q.label}
                {q.required && <Box component="span" sx={{ ml: 0.75, fontSize: 11, color: "text.secondary", fontWeight: 400 }}>(required)</Box>}
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                {QUESTION_TYPES.find((t) => t.value === q.type)?.label}
                {q.options?.length ? ` — ${q.options.join(", ")}` : ""}
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setEditingId(q.id)}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" disabled={i === 0} onClick={() => moveQuestion.mutate({ id: q.id, direction: "up" })}>
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" disabled={i === questions.length - 1} onClick={() => moveQuestion.mutate({ id: q.id, direction: "down" })}>
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => removeQuestion.mutate(q.id)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        ),
      )}

      {tier === "free" ? (
        <UpgradeNudge onUpgrade={onUpgrade} />
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: "12px", border: `1px dashed ${tokens.divider}`, borderRadius: "6px" }}>
          <TextField label="Question" size="small" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth />
          <TextField select label="Type" size="small" value={type} onChange={(e) => setType(e.target.value as QuestionType)} fullWidth>
            {QUESTION_TYPES.filter((t) => t.value !== "address").map((t) => (
              <MenuItem key={t.value} value={t.value}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>
          {type === "multiple_choice" && (
            <TextField
              label="Options (comma-separated)"
              size="small"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              fullWidth
            />
          )}
          {type === "short_text" && (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography sx={{ fontSize: 13 }}>Required</Typography>
              <Switch size="small" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            </Box>
          )}
          <Button startIcon={<AddIcon fontSize="small" />} onClick={add} variant="contained" size="small" sx={{ alignSelf: "flex-start" }}>
            Add question
          </Button>
        </Box>
      )}
    </Box>
  );
}

/**
 * Conversions API setup for the page's pixel.
 *
 * Kept to four controls on purpose: paste a token, choose test or live, save,
 * and see whether events are actually landing. Anything more and it stops being
 * something you can talk a client through on the phone.
 */
function CapiSettings({ pixelId }: { pixelId: string }) {
  const showSnack = useSnack();
  const qc = useQueryClient();
  const cleanPixel = (pixelId || "").replace(/\D/g, "");

  const { data: config } = useQuery({
    queryKey: ["capiConfig", cleanPixel],
    queryFn: () => getCapiConfig(cleanPixel),
    enabled: !!cleanPixel,
  });
  const { data: events = [] } = useQuery({
    queryKey: ["capiEvents", cleanPixel],
    queryFn: () => listCapiEvents(cleanPixel),
    enabled: !!cleanPixel,
    refetchInterval: 30_000,
  });

  const [token, setToken] = useState("");
  const [testCode, setTestCode] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setTestCode(config?.testEventCode ?? ""); }, [config?.testEventCode]);

  if (!cleanPixel) {
    return (
      <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
        Add a Pixel ID above first — conversions are reported against it.
      </Typography>
    );
  }

  async function save(enabled: boolean) {
    setSaving(true);
    try {
      await saveCapiConfig({
        pixelId: cleanPixel,
        accessToken: token,
        enabled,
        testEventCode: testCode.trim() || null,
      });
      setToken("");
      await qc.invalidateQueries({ queryKey: ["capiConfig", cleanPixel] });
      showSnack(enabled ? "Conversions API is on" : "Conversions API is off");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ bgcolor: tokens.surface2, border: `1px solid ${tokens.divider2}`, borderRadius: "6px", p: "12px", display: "flex", flexDirection: "column", gap: 1.25 }}>
      <Typography sx={{ fontSize: 12.5, color: "text.secondary", lineHeight: 1.5 }}>
        Sends conversions to Facebook from our server as well as the browser. Ad blockers
        and iPhones block a lot of browser events, so this recovers leads Facebook
        otherwise never hears about. Both are sent with the same ID, so nothing is
        double-counted.
      </Typography>

      <TextField
        label={config?.hasToken ? "Replace access token" : "Conversions API access token"}
        placeholder={config?.hasToken ? "Leave blank to keep the current one" : "Paste from Events Manager → Settings"}
        value={token}
        onChange={(e) => setToken(e.target.value)}
        type="password"
        size="small"
        fullWidth
      />

      <TextField
        label="Test event code (optional)"
        placeholder="TEST12345"
        value={testCode}
        onChange={(e) => setTestCode(e.target.value)}
        helperText="While this is set, events show in Facebook's Test Events tab and don't affect ad delivery. Clear it to go live."
        size="small"
        fullWidth
      />

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Chip
          size="small"
          label={config?.enabled ? "On" : "Off"}
          color={config?.enabled ? "success" : "default"}
          variant="outlined"
        />
        {config?.testEventCode && <Chip size="small" label="Test mode" color="warning" variant="outlined" />}
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          disabled={saving || (!config?.hasToken && !token.trim())}
          onClick={() => save(!config?.enabled)}
          variant={config?.enabled ? "outlined" : "contained"}
        >
          {config?.enabled ? "Turn off" : "Turn on"}
        </Button>
        {config?.enabled && (
          <Button size="small" disabled={saving} onClick={() => save(true)}>
            Save
          </Button>
        )}
      </Box>

      {/* Proof it's working, rather than asking them to trust the toggle. */}
      {events.length > 0 && (
        <Box sx={{ borderTop: `1px solid ${tokens.divider2}`, pt: 1 }}>
          <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", mb: 0.5 }}>
            Last reported
          </Typography>
          {events.map((ev) => (
            <Typography key={ev.id} sx={{ fontSize: 12.5, color: ev.status === "sent" ? "text.secondary" : "error.main" }}>
              {ev.event_name} · {ev.status} · {timeAgo(ev.created_at)}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}

/** What a single answer does. Three states, no combinations to reason about. */
type AnswerAction = "carry_on" | "dont_count" | "stop";

function EditQuestionRow({ pageId, question, onDone }: { pageId: string; question: CustomQuestion; onDone: () => void }) {
  const updateQuestion = useUpdateCustomQuestion(pageId);
  const [label, setLabel] = useState(question.label);
  const [helperText, setHelperText] = useState(question.helperText ?? "");
  const [required, setRequired] = useState(question.required);
  const [optionsText, setOptionsText] = useState((question.options ?? []).join(", "));
  const [disqualify, setDisqualify] = useState<string[]>(question.disqualifyAnswers ?? []);
  const [lowQuality, setLowQuality] = useState<string[]>(question.lowQualityAnswers ?? []);

  const isChoice = question.type === "multiple_choice" || question.type === "yes_no";
  const currentOptions =
    question.type === "yes_no"
      ? ["Yes", "No"]
      : optionsText.split(",").map((o) => o.trim()).filter(Boolean);

  // Three mutually exclusive actions, stored as two lists — so setting one
  // always clears the other and an answer can never be in both.
  function answerAction(opt: string): AnswerAction {
    if (disqualify.includes(opt)) return "stop";
    if (lowQuality.includes(opt)) return "dont_count";
    return "carry_on";
  }
  function setAnswerAction(opt: string, action: AnswerAction) {
    setDisqualify((d) => (action === "stop" ? [...new Set([...d, opt])] : d.filter((x) => x !== opt)));
    setLowQuality((l) => (action === "dont_count" ? [...new Set([...l, opt])] : l.filter((x) => x !== opt)));
  }

  async function save() {
    if (!label.trim()) return;
    const options = question.type === "multiple_choice"
      ? optionsText.split(",").map((o) => o.trim()).filter(Boolean)
      : question.options;
    await updateQuestion.mutateAsync({
      id: question.id,
      patch: {
        label: label.trim(),
        required,
        ...(question.type === "address" ? { helperText: helperText.trim() } : {}),
        ...(question.type === "multiple_choice" ? { options } : {}),
        // Drop settings for options that no longer exist, so renaming an
        // option can't leave a rule pointing at nothing.
        ...(isChoice
          ? {
              disqualifyAnswers: disqualify.filter((o) => currentOptions.includes(o)),
              lowQualityAnswers: lowQuality.filter((o) => currentOptions.includes(o)),
            }
          : {}),
      },
    });
    onDone();
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: "12px", border: `1px solid ${tokens.primary}`, borderRadius: "6px" }}>
      <TextField label="Question" size="small" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth autoFocus />
      {question.type === "address" && (
        <TextField label="Example / helper text" size="small" value={helperText} onChange={(e) => setHelperText(e.target.value)} fullWidth />
      )}
      {question.type === "multiple_choice" && (
        <TextField label="Options (comma-separated)" size="small" value={optionsText} onChange={(e) => setOptionsText(e.target.value)} fullWidth />
      )}

      {isChoice && currentOptions.length > 0 && (
        <Box sx={{ bgcolor: tokens.surface2, border: `1px solid ${tokens.divider2}`, borderRadius: "6px", p: "10px 12px" }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "text.secondary", mb: 0.25 }}>
            If they pick this, what happens?
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: "text.secondary", mb: 1.25 }}>
            Leave these on "Carry on" unless an answer tells you it is not a real lead.
          </Typography>
          {currentOptions.map((opt) => (
            <Box key={opt} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: 13.5, flex: 1, minWidth: 90, wordBreak: "break-word" }}>{opt}</Typography>
              <TextField
                select
                size="small"
                value={answerAction(opt)}
                onChange={(e) => setAnswerAction(opt, e.target.value as AnswerAction)}
                sx={{ minWidth: 200, "& .MuiInputBase-input": { fontSize: 13, py: 0.75 } }}
              >
                <MenuItem value="carry_on" sx={{ fontSize: 13 }}>Carry on</MenuItem>
                <MenuItem value="dont_count" sx={{ fontSize: 13 }}>Take it, don&apos;t count</MenuItem>
                <MenuItem value="stop" sx={{ fontSize: 13 }}>Stop &mdash; not a lead</MenuItem>
              </TextField>
            </Box>
          ))}
          <Typography sx={{ fontSize: 11.5, color: "text.disabled", mt: 0.75, lineHeight: 1.5 }}>
            <strong>Take it, don&apos;t count</strong> still gives you the lead &mdash; Facebook just
            isn&apos;t told it converted, so it stops looking for more like it.
          </Typography>
        </Box>
      )}

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: 13 }}>Required</Typography>
        <Switch size="small" checked={required} onChange={(e) => setRequired(e.target.checked)} />
      </Box>
      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
        <Button size="small" onClick={onDone}>
          Cancel
        </Button>
        <Button size="small" variant="contained" onClick={save}>
          Save
        </Button>
      </Box>
    </Box>
  );
}
