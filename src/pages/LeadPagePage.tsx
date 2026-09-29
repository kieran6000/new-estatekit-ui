import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  Checkbox,
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
  Toolbar,
  Typography,
  useMediaQuery,
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
import { getFbForm, listFbForms, listFbPages, type FbForm } from "../api/leadPages";
import FbFormPreview from "../components/FbFormPreview";
import { getMyProfile } from "../api/agentProfile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trackActivity } from "../lib/activity";
import RecentSalesEditor from "../components/RecentSalesEditor";
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
import FormPresetPicker from "../components/FormPresetPicker";
import InfoTip from "../components/InfoTip";
import ConfirmationEmailCard from "../components/ConfirmationEmailCard";
import OptionsEditor from "../components/OptionsEditor";
import { cleanOptions } from "../lib/options";
import { applyFormPreset, FORM_PRESET_VERSION, presetByKey } from "../lib/formPresets";
import type { FormPresetKey } from "../types";
import { MAX_IMAGE_BYTES, uploadImage } from "../lib/image";

export default function LeadPagePage() {
  const navigate = useNavigate();
  const { tier } = useTier();
  const { data: isOperator } = useIsOperator();
  // Agents use their page; setting it up (sources, questions, form type,
  // wording, link) is done by EstateKit. Locked sections stay visible,
  // read-only, so agents can still see what their form does.
  const canSetUp = isOperator === true;
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
  // A page can point at a pipeline this account can't see — it happens when the
  // page was created while a different account was active. Falling back keeps
  // the page openable: without this, one such page made every lead source
  // disappear behind "No lead sources yet", because the screen below bails out
  // on a missing pipeline and the page picker never gets a chance to render.
  const linkedPipeline: Pipeline | undefined = pipelines.find((p) => p.id === page?.pipelineId);
  const pipeline: Pipeline | undefined = linkedPipeline ?? pipelines[0];
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [form, setForm] = useState({
    agentName: "", headline: "", suburb: "", phone: "",
    nameLabel: "", phoneLabel: "", ctaLabel: "",
    thankYouHeadline: "", thankYouSubtext: "", fbPixelId: "",
    dqHeadline: "", dqText: "", dqCtaLabel: "", dqCtaUrl: "",
  });
  // Bumped after a preset rewrites the page's wording, so the fields reload.
  const [formResetKey, setFormResetKey] = useState(0);

  useEffect(() => {
    if (page) {
      setForm({
        agentName: page.agentName, headline: page.headline, suburb: page.suburb, phone: page.phone,
        nameLabel: page.nameLabel, phoneLabel: page.phoneLabel, ctaLabel: page.ctaLabel,
        thankYouHeadline: page.thankYouHeadline, thankYouSubtext: page.thankYouSubtext, fbPixelId: page.fbPixelId,
        dqHeadline: page.dqHeadline, dqText: page.dqText, dqCtaLabel: page.dqCtaLabel, dqCtaUrl: page.dqCtaUrl,
      });
    }
    // formResetKey: reload after a preset rewrote the wording.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, formResetKey]);

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
        {canSetUp ? (
          <>
            <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 3 }}>
              Create a lead page or connect a Facebook instant form to start capturing leads.
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddPageOpen(true)}>
              Add lead source
            </Button>
          </>
        ) : (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            EstateKit is setting up your lead page. It will appear here when it's ready.
          </Typography>
        )}
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

  // Pictures go to Storage (shrunk); the row only keeps the link. They used
  // to be stored inside the row, so every page view re-downloaded them.
  async function onLogoChange(file: File | null) {
    if (!file || !page) return;
    if (file.size > MAX_IMAGE_BYTES) { showSnack("That image is too big. Try another one."); return; }
    try {
      update({ logoDataUrl: await uploadImage(file, "logo", page.agentId) });
      showSnack("Logo uploaded");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't upload the logo. Try again.");
    }
  }

  async function onPhotoChange(file: File | null) {
    if (!file || !page) return;
    if (file.size > MAX_IMAGE_BYTES) { showSnack("That photo is too big. Try another one."); return; }
    try {
      update({ profilePhotoDataUrl: await uploadImage(file, "photo", page.agentId) });
      showSnack("Profile photo uploaded");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't upload the photo. Try again.");
    }
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
              {canSetUp && (<>
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
              </>)}
            </MenuItem>
          ))}
          {canSetUp && (
            <MenuItem
              onClick={() => {
                setPageMenuAnchor(null);
                setAddPageOpen(true);
              }}
              sx={{ color: tokens.primary, borderTop: `1px solid ${tokens.divider2}`, mt: 0.5 }}
            >
              + Add page
            </MenuItem>
          )}
        </Menu>
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
          {linkedPipeline
            ? <>Sends leads to <b style={{ color: tokens.ink }}>{pipeline.name}</b> pipeline</>
            : <>This page isn't linked to one of your lists yet</>}
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
      ) : null}
      {page.sourceType === "fb_form" && (
        <Box sx={{ maxWidth: 1000, mx: "auto", px: 2, pb: 3 }}>
          <ConfirmationEmailCard profile={profile} canSetUp={canSetUp} />
        </Box>
      )}
      {page.sourceType === "fb_form" ? null : (
        // Phones: preview and link first, then what the agent uses most.
        // Desktop: the same order on the left, preview + link sticky on the right.
        <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3, p: 2, maxWidth: 1100, mx: "auto" }}>
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <Section
              title="Questions"
              locked={!canSetUp}
              info="Each question gets its own screen. Name, phone number and (if on) email are always asked last."
            >
              {pipeline.kind === "seller" && (
                <PresetBar page={page} canChange={canSetUp} onApplied={() => setFormResetKey((k) => k + 1)} />
              )}
              {canSetUp && (
                <>
                <TextField label="Contact fields description" placeholder="Where should we send your FREE home evaluation?" value={form.nameLabel} onChange={(e) => fieldChange("nameLabel", e.target.value)} fullWidth />
                <TextField label="Phone number label" value={form.phoneLabel} onChange={(e) => fieldChange("phoneLabel", e.target.value)} fullWidth />
                <TextField label="Submit button text" value={form.ctaLabel} onChange={(e) => fieldChange("ctaLabel", e.target.value)} fullWidth />
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 500 }}>Email</Typography>
                    <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Turn off to collect only full name and phone number</Typography>
                  </Box>
                  <Switch checked={page.collectEmail} onChange={(e) => update({ collectEmail: e.target.checked })} />
                </Box>

                </>
              )}

              <CustomQuestionEditor pageId={page.id} tier={tier} readOnly={!canSetUp} onUpgrade={() => {
                posthog.capture("upgrade_clicked", { source: "lead_page_custom_questions" });
                navigate("/upgrade");
              }} />
            </Section>

            <Section title={canSetUp ? "Page details" : "Your details"}>
              <TextField label="Agent name" value={form.agentName} onChange={(e) => fieldChange("agentName", e.target.value)} fullWidth />
              {canSetUp && (
                <>
                  <TextField label="Intro headline" value={form.headline} onChange={(e) => fieldChange("headline", e.target.value)} fullWidth multiline minRows={2} />
                  <TextField label="Suburb / area" value={form.suburb} onChange={(e) => fieldChange("suburb", e.target.value)} fullWidth />
                </>
              )}
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

              {canSetUp && (
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 500 }}>Intro</Typography>
                  <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>A greeting screen with your intro headline, before the first question</Typography>
                </Box>
                <Switch checked={page.showIntro} onChange={(e) => update({ showIntro: e.target.checked })} />
              </Box>
              )}
            </Section>

            <Section title="Recent sales" info="Homes you've sold or listed, shown under your form and after people send it. It helps sellers trust you.">
              <RecentSalesEditor />
            </Section>

            {canSetUp && (
              <>
              <Section title="Message for leads" info="What people see right after they send the form. Write {name} for their first name and {agent} for yours.">
                <TextField
                  label="Headline"
                  value={form.thankYouHeadline}
                  onChange={(e) => fieldChange("thankYouHeadline", e.target.value)}
                  fullWidth
                 
                />
                <TextField label="Description" value={form.thankYouSubtext} onChange={(e) => fieldChange("thankYouSubtext", e.target.value)} fullWidth multiline minRows={2} />
              </Section>
              </>
            )}

            {canSetUp && (
              <>
              <Section
                title="End page"
                info="Shown instead of the message for leads when someone picks an answer you've set to “Send to end page”. They aren't saved as a lead. Leave it blank for our standard wording, or add a button to send them somewhere useful."
              >
                <TextField label="Headline" placeholder="Thanks for your interest!" value={form.dqHeadline} onChange={(e) => fieldChange("dqHeadline", e.target.value)} fullWidth />
                <TextField label="Description" placeholder="Based on your answers, this might not be the right time for a valuation…" value={form.dqText} onChange={(e) => fieldChange("dqText", e.target.value)} fullWidth multiline minRows={2} />
                <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                  <TextField label="Button text" placeholder="e.g. Follow us on Facebook" value={form.dqCtaLabel} onChange={(e) => fieldChange("dqCtaLabel", e.target.value)} sx={{ flex: "1 1 160px" }} />
                  <TextField label="Website link" placeholder="https://…" value={form.dqCtaUrl} onChange={(e) => fieldChange("dqCtaUrl", e.target.value.trim())} sx={{ flex: "2 1 220px" }} />
                </Box>
              </Section>
              </>
            )}

            <ConfirmationEmailCard profile={profile} canSetUp={canSetUp} />

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
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, alignSelf: { md: "flex-start" }, position: { md: "sticky" }, top: { md: 72 }, order: { xs: -1, md: 0 } }}>
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

            <ShareSection page={page} onUpdateSlug={canSetUp ? (slug) => updatePage.mutate({ id: page.id, patch: { slug } }) : undefined} />

            {isOperator && <LeadPageFunnelStats pageId={page.id} />}
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
            label="Form name"
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
    // The source knows which page its form lives on; the profile is only the
    // default. Passing the wrong page made the preview show the wrong brand.
    queryFn: () => getFbForm(page.fbPageId ?? fbPageId, page.fbFormId!),
    enabled: !!page.fbFormId,
    staleTime: 10 * 60_000,
    retry: false,
    // Facebook quota is app-wide and shared by every client. Refetching this
    // whenever the tab regains focus spent it for no benefit — the form
    // definition barely changes.
    refetchOnWindowFocus: false,
  });
  const form = data?.form;
  const rateLimited = data?.rateLimited === true;
  const fbName = data?.page?.name || pageName;
  const fbAvatar = data?.page?.picture || avatarUrl;

  const CONTACT = new Set(["FULL_NAME", "EMAIL", "PHONE", "FIRST_NAME", "LAST_NAME", "STREET_ADDRESS", "CITY", "ZIP", "COUNTRY", "PROVINCE", "STATE"]);

  return (
    <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3, p: 2, maxWidth: 1000, mx: "auto", alignItems: "flex-start" }}>
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
        <Section title="Questions">
          {isLoading ? (
            <Skeleton variant="rounded" height={160} sx={{ borderRadius: "8px" }} />
          ) : error || data?.noAccess || rateLimited ? (
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              {data?.noAccess
                ? "EstateKit doesn't have access to this Facebook page, so the form's questions can't be shown."
                : rateLimited
                  // Not a fault — Facebook throttles the whole app for a few
                  // minutes. Saying "try again" invites the retrying that
                  // caused it, so the wording tells them to leave it alone.
                  ? "Facebook is busy right now, so the questions can't be shown for a few minutes. Nothing is broken and your leads are still coming in."
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
                          ? `Choice — ${q.options.map((o) => o.value).join("; ")}`
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
              {rateLimited
                ? "Facebook is busy right now. The preview will come back on its own in a few minutes."
                : "Preview unavailable — couldn't load the form from Facebook."}
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

function ShareSection({ page, onUpdateSlug }: { page: LeadPage; onUpdateSlug?: (slug: string) => void }) {
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
      onUpdateSlug?.(clean);
      trackActivity("page_link_changed", { agentId: page.agentId, page: { name: page.name, slug: clean }, detail: `/p/${page.slug} → /p/${clean}. Update any ads pointing at the old link.` });
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
            onClick={() => { if (!onUpdateSlug) return; setSlugDraft(page.slug); setEditingSlug(true); }}
            title={onUpdateSlug ? "Click to edit the link" : undefined}
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

/**
 * Which Facebook page a lead source reads its forms from.
 *
 * Collapsed to a single line by default, because the agent profile page is
 * right for almost everyone and a page dropdown here would be a decision
 * nobody asked for. It only expands when someone genuinely has a second page —
 * a separate brand, market or recruitment page — which is the case the
 * dashboard previously could not handle at all.
 *
 * The page list is fetched only on expand: it goes to me/accounts, the most
 * expensive Graph call we make, so it must never load speculatively.
 */
function FbPagePicker({
  agentPageId,
  selectedPageId,
  open,
  onOpen,
  onPick,
}: {
  agentPageId: string | null;
  selectedPageId: string | null;
  open: boolean;
  onOpen: () => void;
  onPick: (pageId: string | null) => void;
}) {
  const { data: pages = [], isFetching } = useQuery({
    queryKey: ["fbPages"],
    queryFn: listFbPages,
    enabled: open,
    staleTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });

  const activeId = selectedPageId ?? agentPageId;
  const activeName = pages.find((p) => p.id === activeId)?.name;

  if (!open) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
          {selectedPageId
            ? `Forms from ${activeName ?? selectedPageId}`
            : "Forms from this account's Facebook page"}
        </Typography>
        <Box
          component="button"
          onClick={onOpen}
          sx={{ p: 0, border: 0, bgcolor: "transparent", cursor: "pointer", font: "inherit", fontSize: 12.5, color: tokens.primary, textDecoration: "underline" }}
        >
          Use a different page
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 1.5 }}>
      <TextField
        select
        size="small"
        label="Facebook page"
        value={activeId ?? ""}
        onChange={(e) => onPick(e.target.value === agentPageId ? null : e.target.value)}
        helperText={isFetching ? "Loading pages from Facebook…" : "Only change this if the form lives on another page"}
        fullWidth
      >
        {agentPageId && (
          <MenuItem value={agentPageId}>
            {pages.find((p) => p.id === agentPageId)?.name ?? "This account's page"}
          </MenuItem>
        )}
        {pages.filter((p) => p.id !== agentPageId).map((p) => (
          <MenuItem key={p.id} value={p.id} sx={{ fontSize: 13.5 }}>{p.name}</MenuItem>
        ))}
      </TextField>
    </Box>
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
  const [preset, setPreset] = useState<FormPresetKey | "blank">("balanced");
  const qc = useQueryClient();
  // Phones get the whole screen: a floating box with margins left the form
  // types as a cramped scroll.
  const isPhone = useMediaQuery("(max-width:599px)");
  const [pipelineId, setPipelineId] = useState("");
  const [fbForms, setFbForms] = useState<FbForm[]>([]);
  const [fbFormId, setFbFormId] = useState("");
  const [loadingForms, setLoadingForms] = useState(false);
  // Which Facebook page to read forms from. Defaults to the agent's own, so a
  // single-page client never makes this choice. Only differs when they
  // deliberately open the picker.
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [pickingPage, setPickingPage] = useState(false);
  const effectivePageId = selectedPageId ?? fbPageId;
  // Why the form list is empty, when it isn't simply "no forms on the page".
  const [formsProblem, setFormsProblem] = useState<"no_access" | "failed" | "busy" | null>(null);
  const addPage = useAddLeadPage();
  const posthog = usePostHog();

  useEffect(() => {
    if (open) {
      setName("");
      setPreset("balanced");
      setSourceType("website");
      setPipelineId(pipelines[0]?.id ?? "");
      setFbForms([]);
      setFbFormId("");
      setFormsProblem(null);
      setSelectedPageId(null);
      setPickingPage(false);
    }
  }, [open, pipelines]);

  useEffect(() => {
    if (sourceType !== "fb_form" || !open) return;
    if (!effectivePageId) { setFbForms([]); setFormsProblem(null); return; }
    let cancelled = false;
    (async () => {
      setLoadingForms(true);
      setFormsProblem(null);
      try {
        const { forms, noAccess, rateLimited } = await listFbForms(effectivePageId);
        if (!cancelled) {
          setFbForms(forms);
          setFormsProblem(noAccess ? "no_access" : rateLimited ? "busy" : null);
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
  }, [sourceType, open, effectivePageId]);

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
      // Null when it is the agent's own page, so the row keeps the existing
      // "fall back to the profile" behaviour rather than pinning a duplicate.
      fbPageId: selectedPageId,
    });
    // Seller lead pages start from a friction preset. If that fails, the page
    // still exists and works (blank), so it's logged rather than thrown.
    const formPreset = sourceType === "website" && pipeline.kind === "seller" && preset !== "blank" ? preset : null;
    if (formPreset) {
      try {
        await applyFormPreset(p, formPreset, true);
        await qc.invalidateQueries({ queryKey: ["leadPages"] });
      } catch (e) {
        console.error("preset on create failed", e);
      }
    }
    posthog.capture("lead_page_added", { preset: pipeline.kind, sourceType, form_preset: formPreset });
    onClose();
    onCreated(p.id);
  }

  const canCreate = sourceType === "website" ? !!name.trim() && !!pipelineId : !!fbFormId && !!pipelineId;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" fullScreen={isPhone}>
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
          <>
            <TextField label="Form name" value={name} onChange={(e) => setName(e.target.value)} fullWidth autoFocus />
            {pipelines.find((pl) => pl.id === pipelineId)?.kind === "seller" && (
              <Box>
                <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>Form type</Typography>
                <FormPresetPicker value={preset} onChange={setPreset} allowBlank />
              </Box>
            )}
          </>
        ) : (
          <Box>
            {/* Which page these forms come from. Hidden behind a link, because
                almost every agent has exactly one page and should not have to
                think about this at all. Only someone running a second brand or
                market ever opens it. */}
            <FbPagePicker
              agentPageId={fbPageId}
              selectedPageId={selectedPageId}
              open={pickingPage}
              onOpen={() => setPickingPage(true)}
              onPick={(id) => { setSelectedPageId(id); setFbFormId(""); setPickingPage(false); }}
            />
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
                    : formsProblem === "busy"
                      ? "Facebook is busy right now. Your forms will show again in a few minutes — you can still create the source and pick the form after."
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
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 0.5 }}>Which list should new leads go into?</Typography>
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

/** Which form type (friction preset) this page is built on, and a way to change it. */
function PresetBar({ page, canChange, onApplied }: { page: LeadPage; canChange: boolean; onApplied: () => void }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const posthog = usePostHog();
  const current = presetByKey(page.preset);
  // Built on an older version of this form type. Never updated silently.
  const outdated = !!current && (page.presetVersion ?? 0) < FORM_PRESET_VERSION;
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<FormPresetKey | "blank">(page.preset ?? "balanced");
  const [withCopy, setWithCopy] = useState(true);
  const [busy, setBusy] = useState(false);
  const isPhone = useMediaQuery("(max-width:599px)");

  async function apply() {
    if (choice === "blank") return;
    setBusy(true);
    try {
      await applyFormPreset(page, choice, withCopy);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["customQuestions", page.id] }),
        qc.invalidateQueries({ queryKey: ["leadPages"] }),
      ]);
      posthog.capture("form_preset_applied", { preset: choice, from: page.preset ?? "custom", with_copy: withCopy });
      trackActivity("form_type_changed", { agentId: page.agentId, page: { name: page.name, slug: page.slug }, detail: `${presetByKey(page.preset)?.name ?? "Custom"} → ${presetByKey(choice)?.name}${withCopy ? " (with standard wording)" : ""}` });
      onApplied();
      setOpen(false);
      showSnack(`Form type changed to ${presetByKey(choice)?.name}`);
    } catch (e) {
      console.error(e);
      showSnack("Couldn't change the form type. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: "10px 12px", bgcolor: tokens.primaryBg, borderRadius: "4px" }}>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 0.25 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
            {current ? `Form type: ${current.name}` : "Form type: Custom"}
          </Typography>
          {outdated && canChange && (
            <Typography component="span" sx={{ fontSize: 12, color: "warning.dark", ml: 0.5 }}>· newer version available</Typography>
          )}
          <InfoTip>
            Ready-made sets of questions. More questions means fewer leads, but more serious ones. You can still edit the
            questions afterwards.
          </InfoTip>
        </Box>
        {canChange && (
          <Button
            size="small"
            variant="outlined"
            onClick={() => { setChoice(page.preset ?? "balanced"); setWithCopy(true); setOpen(true); }}
            sx={{ flexShrink: 0, bgcolor: "background.paper" }}
          >
            {outdated ? "Update" : current ? "Change form type" : "Choose form type"}
          </Button>
        )}
      </Box>

      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="sm" fullScreen={isPhone}>
        <DialogTitle>Choose a form type</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <FormPresetPicker value={choice} onChange={setChoice} />
          <FormControlLabel
            control={<Checkbox checked={withCopy} onChange={(e) => setWithCopy(e.target.checked)} />}
            label={<Typography sx={{ fontSize: 14 }}>Also update the headline and messages to match</Typography>}
          />
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
            This replaces the questions on this form. Leads you already have won't change.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={apply} disabled={busy || choice === "blank"} variant="contained">{busy ? "Applying…" : "Apply"}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function Section({ title, action, info, locked, children }: { title: string; action?: React.ReactNode; info?: React.ReactNode; locked?: boolean; children: React.ReactNode }) {
  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 30 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</Typography>
          {info && <InfoTip>{info}</InfoTip>}
        </Box>
        {locked && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}>
            <LockIcon sx={{ fontSize: 14 }} />
            <Typography sx={{ fontSize: 12 }}>Set up by EstateKit</Typography>
          </Box>
        )}
        {action}
      </Box>
      {children}
    </Box>
  );
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "short_text", label: "Short answer" },
  { value: "address", label: "Street address" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "yes_no", label: "Yes / no" },
];

function CustomQuestionEditor({
  pageId,
  tier,
  readOnly = false,
  onUpgrade,
}: {
  pageId: string;
  tier: "free" | "paid";
  /** Agents see the questions but can't change them. */
  readOnly?: boolean;
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
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const canAdd = !!label.trim() && (type !== "multiple_choice" || cleanOptions(options).length >= 2);

  async function add() {
    if (!canAdd) return;
    await addQuestion.mutateAsync({ label: label.trim(), type, required, options: type === "multiple_choice" ? cleanOptions(options) : undefined });
    posthog.capture("custom_question_added", { type });
    setLabel("");
    setOptions(["", ""]);
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
                {q.validation === "street_number" ? " — must include a street number" : ""}
                {q.options?.length ? ` — ${q.options.join(" · ")}` : ""}
              </Typography>
            </Box>
            {!readOnly && (<>
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
            </>)}
          </Box>
        ),
      )}

      {readOnly ? null : tier === "free" ? (
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
          {type === "multiple_choice" && <OptionsEditor value={options} onChange={setOptions} />}
          {type === "short_text" && (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography sx={{ fontSize: 13 }}>Required</Typography>
              <Switch size="small" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            </Box>
          )}
          <Button startIcon={<AddIcon />} onClick={add} disabled={!canAdd} variant="contained" sx={{ alignSelf: "flex-start" }}>
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
    refetchInterval: 2 * 60_000,
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

/** What to do with the answers marked bad. Asked once per question. */
type BadAnswerTreatment = "stop" | "dont_count";

function EditQuestionRow({ pageId, question, onDone }: { pageId: string; question: CustomQuestion; onDone: () => void }) {
  const updateQuestion = useUpdateCustomQuestion(pageId);
  const [label, setLabel] = useState(question.label);
  const [helperText, setHelperText] = useState(question.helperText ?? "");
  const [required, setRequired] = useState(question.required);
  const [options, setOptions] = useState<string[]>(question.options?.length ? question.options : ["", ""]);
  // One list of bad answers plus one decision, rather than a setting on every
  // answer. Both database columns still exist — which one the list is saved to
  // is just the treatment — so the form engine and the migration are unchanged.
  const [bad, setBad] = useState<string[]>(() => [
    ...new Set([...(question.disqualifyAnswers ?? []), ...(question.lowQualityAnswers ?? [])]),
  ]);
  const [treatment, setTreatment] = useState<BadAnswerTreatment>(
    (question.lowQualityAnswers?.length ?? 0) > 0 ? "dont_count" : "stop",
  );

  const isChoice = question.type === "multiple_choice" || question.type === "yes_no";
  const currentOptions =
    question.type === "yes_no"
      ? ["Yes", "No"]
      : cleanOptions(options);

  function toggleBad(opt: string) {
    setBad((b) => (b.includes(opt) ? b.filter((x) => x !== opt) : [...b, opt]));
  }

  async function save() {
    if (!label.trim()) return;
    const badInOptions = bad.filter((o) => currentOptions.includes(o));
    const savedOptions = question.type === "multiple_choice" ? cleanOptions(options) : question.options;
    await updateQuestion.mutateAsync({
      id: question.id,
      patch: {
        label: label.trim(),
        required,
        ...(question.type === "address" ? { helperText: helperText.trim() } : {}),
        ...(question.type === "multiple_choice" ? { options: savedOptions } : {}),
        // The ticked answers go into whichever column matches the treatment,
        // and the other is cleared. Options that no longer exist are dropped,
        // so renaming one can't leave a rule pointing at nothing.
        ...(isChoice
          ? {
              disqualifyAnswers: treatment === "stop" ? badInOptions : [],
              lowQualityAnswers: treatment === "dont_count" ? badInOptions : [],
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
        <TextField label="Hint (optional)" placeholder="e.g. 14 Loop Street, Centurion" size="small" value={helperText} onChange={(e) => setHelperText(e.target.value)} fullWidth />
      )}
      {question.type === "multiple_choice" && <OptionsEditor value={options} onChange={setOptions} />}

      {isChoice && currentOptions.length > 0 && (
        <Box sx={{ bgcolor: tokens.surface2, border: `1px solid ${tokens.divider2}`, borderRadius: "6px", p: "10px 12px" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, mb: 0.25 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.secondary" }}>
              Any answers you don&apos;t want?
            </Typography>
            <InfoTip>Tick answers that mean it isn&apos;t a good lead for you, like &quot;Just curious&quot;. Most questions need none.</InfoTip>
          </Box>

          {currentOptions.map((opt) => (
            <FormControlLabel
              key={opt}
              control={<Checkbox size="small" checked={bad.includes(opt)} onChange={() => toggleBad(opt)} />}
              label={<Typography sx={{ fontSize: 13.5 }}>{opt}</Typography>}
              sx={{ display: "flex", m: 0 }}
            />
          ))}

          {/* Only appears once something is ticked. With nothing marked there
              is no decision to make, and an always-visible radio would just be
              one more thing to read past. Asked once for the whole question
              rather than per answer — nobody wants to reject one bad answer and
              quietly keep another. */}
          {bad.length > 0 && (
            <Box sx={{ mt: 1.25, pt: 1.25, borderTop: `1px solid ${tokens.divider2}` }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "text.secondary", mb: 0.25 }}>
                What happens to them?
              </Typography>
              <RadioGroup value={treatment} onChange={(e) => setTreatment(e.target.value as BadAnswerTreatment)}>
                <FormControlLabel
                  value="stop"
                  control={<Radio size="small" />}
                  label={<Typography sx={{ fontSize: 13.5 }}>Send to end page &mdash; the lead isn&apos;t saved</Typography>}
                  sx={{ m: 0, mt: 0.25 }}
                />
                <FormControlLabel
                  value="dont_count"
                  control={<Radio size="small" />}
                  label={
                    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
                      <Typography component="span" sx={{ fontSize: 13.5 }}>Keep the lead, but don&apos;t count it as a good one</Typography>
                      <InfoTip>Your ads learn from the leads you count. Not counting weak ones keeps Facebook looking for serious sellers.</InfoTip>
                    </Box>
                  }
                  sx={{ m: 0, mt: 0.25 }}
                />
              </RadioGroup>
            </Box>
          )}
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
