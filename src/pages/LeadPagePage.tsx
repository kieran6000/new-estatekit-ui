import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
} from "@mui/material";
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
import { useAddLeadPage, useLeadPages, useSubmitMockLead, useUpdateLeadPage } from "../hooks/useLeadPages";
import { usePipelines } from "../hooks/usePipelines";
import {
  useAddCustomQuestion,
  useCustomQuestions,
  useMoveCustomQuestion,
  useRemoveCustomQuestion,
  useUpdateCustomQuestion,
} from "../hooks/useCustomQuestions";
import { useTier } from "../hooks/useTier";
import { useSnack } from "../hooks/useSnack";
import LeadCaptureForm from "../components/LeadCaptureForm";

export default function LeadPagePage() {
  const navigate = useNavigate();
  const { tier } = useTier();
  const { data: pages = [], isLoading: pagesLoading } = useLeadPages();
  const { data: pipelines = [], isLoading: pipelinesLoading } = usePipelines();
  const updatePage = useUpdateLeadPage();
  const showSnack = useSnack();
  const posthog = usePostHog();

  const [pageId, setPageId] = useState<string | null>(null);
  const [pageMenuAnchor, setPageMenuAnchor] = useState<HTMLElement | null>(null);
  const [addPageOpen, setAddPageOpen] = useState(false);

  const page: LeadPage | undefined = pages.find((p) => p.id === pageId) ?? pages[0];
  const pipeline: Pipeline | undefined = pipelines.find((p) => p.id === page?.pipelineId);

  if (pagesLoading || pipelinesLoading) return <LeadPagePageSkeleton />;
  if (!page || !pipeline) return null;

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
          sx={{ display: "flex", alignItems: "center", gap: 0.25, border: `1px solid ${tokens.divider}`, borderRadius: "4px", bgcolor: "#fff", fontSize: 13, fontWeight: 500, p: "7px 6px 7px 12px", cursor: "pointer" }}
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
            >
              {p.name}
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

      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3, p: 2, maxWidth: 1100, mx: "auto" }}>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <Section title="Page details">
            <TextField label="Agent name" value={page.agentName} onChange={(e) => update({ agentName: e.target.value })} fullWidth />
            <TextField label="Headline" value={page.headline} onChange={(e) => update({ headline: e.target.value })} fullWidth multiline minRows={2} />
            <TextField label="Suburb / area" value={page.suburb} onChange={(e) => update({ suburb: e.target.value })} fullWidth />
            <TextField label="Phone" value={page.phone} onChange={(e) => update({ phone: e.target.value })} fullWidth />
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
            <TextField label="Submit button text" value={page.ctaLabel} onChange={(e) => update({ ctaLabel: e.target.value })} fullWidth />
            <TextField
              label="Thank-you headline"
              value={page.thankYouHeadline}
              onChange={(e) => update({ thankYouHeadline: e.target.value })}
              helperText="{name} is replaced with what they typed"
              fullWidth
            />
            <TextField label="Thank-you subtext" value={page.thankYouSubtext} onChange={(e) => update({ thankYouSubtext: e.target.value })} fullWidth multiline minRows={2} />
          </Section>

          <Section title="Tracking">
            <TextField
              label="Facebook Pixel ID"
              placeholder="Paste pixel ID or the full code snippet from Facebook"
              value={page.fbPixelId}
              onChange={(e) => {
                let val = e.target.value;
                const match = val.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]\s*\)/);
                if (match) val = match[1];
                update({ fbPixelId: val });
              }}
              helperText="Paste just the ID (e.g. 1234567890123456) or the full pixel code — we'll extract the ID automatically"
              fullWidth
              multiline
              minRows={1}
              maxRows={3}
            />
          </Section>

          <Section title="Form questions">
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              Name, phone and email are always collected last, in that order, and can't be reordered or removed. Every other
              question — including the address and timeline ones every page starts with — can be edited, reordered or removed.
            </Typography>
            <TextField label="Name field question" value={page.nameLabel} onChange={(e) => update({ nameLabel: e.target.value })} fullWidth />
            <TextField label="Phone field question" value={page.phoneLabel} onChange={(e) => update({ phoneLabel: e.target.value })} fullWidth />

            <CustomQuestionEditor pageId={page.id} tier={tier} onUpgrade={() => {
              posthog.capture("upgrade_clicked", { source: "lead_page_custom_questions" });
              navigate("/upgrade");
            }} />
          </Section>
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
            <PreviewAndSubmit page={page} pipelineKind={pipeline.kind} />
          </Section>

          <ShareSection page={page} />
        </Box>
      </Box>

      <AddPageDialog
        open={addPageOpen}
        pipelines={pipelines}
        onClose={() => setAddPageOpen(false)}
        onCreated={(id) => {
          setPageId(id);
          showSnack("Page created");
        }}
      />
    </Box>
  );
}

function PreviewAndSubmit({ page, pipelineKind }: { page: LeadPage; pipelineKind: PipelineKind }) {
  const { data: customQuestions = [] } = useCustomQuestions(page.id);
  const submitLead = useSubmitMockLead();
  const showSnack = useSnack();
  return (
    <LeadCaptureForm
      page={page}
      pipelineKind={pipelineKind}
      customQuestions={customQuestions}
      onSubmit={async ({ name, phone, email, answers }) => {
        await submitLead.mutateAsync({ pageId: page.id, name, phone, email, formAnswers: answers });
        showSnack("Form submitted (demo) — a real lead lands in Leads once connected");
      }}
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

function ShareSection({ page }: { page: LeadPage }) {
  const showSnack = useSnack();
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

  return (
    <Section title="Start capturing leads">
      <Typography sx={{ fontSize: 13.5, color: "text.secondary", mt: -1 }}>
        Share this link anywhere — every submission lands straight in your Leads tab.
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <TextField value={shareUrl} fullWidth size="small" slotProps={{ input: { readOnly: true } }} />
        <Button variant="outlined" startIcon={<ContentCopyIcon fontSize="small" />} onClick={copyLink}>
          Copy
        </Button>
      </Box>
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
  onClose,
  onCreated,
}: {
  open: boolean;
  pipelines: Pipeline[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const addPage = useAddLeadPage();
  const posthog = usePostHog();

  useEffect(() => {
    if (open) {
      setName("");
      setPipelineId(pipelines[0]?.id ?? "");
    }
  }, [open, pipelines]);

  async function create() {
    const pipeline = pipelines.find((p) => p.id === pipelineId);
    if (!pipeline || !name.trim()) return;
    const p = await addPage.mutateAsync({ name: name.trim(), pipelineId: pipeline.id, kind: pipeline.kind });
    posthog.capture("lead_page_added", { preset: pipeline.kind });
    onClose();
    onCreated(p.id);
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: 18, fontWeight: 500 }}>Add a lead page</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField label="Page name" value={name} onChange={(e) => setName(e.target.value)} fullWidth autoFocus />
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
        <Button variant="contained" disabled={!name.trim() || !pipelineId} onClick={create}>
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

function EditQuestionRow({ pageId, question, onDone }: { pageId: string; question: CustomQuestion; onDone: () => void }) {
  const updateQuestion = useUpdateCustomQuestion(pageId);
  const [label, setLabel] = useState(question.label);
  const [helperText, setHelperText] = useState(question.helperText ?? "");
  const [required, setRequired] = useState(question.required);
  const [optionsText, setOptionsText] = useState((question.options ?? []).join(", "));

  async function save() {
    if (!label.trim()) return;
    await updateQuestion.mutateAsync({
      id: question.id,
      patch: {
        label: label.trim(),
        required,
        ...(question.type === "address" ? { helperText: helperText.trim() } : {}),
        ...(question.type === "multiple_choice"
          ? { options: optionsText.split(",").map((o) => o.trim()).filter(Boolean) }
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
