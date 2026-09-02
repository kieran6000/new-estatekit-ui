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
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineRounded";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { tokens } from "../theme";
import { PIPELINE_KIND_LABEL, type LeadPage, type Pipeline, type PipelineKind, type QuestionType } from "../types";
import { shortLinkFor } from "../api/leadPages";
import { useAddLeadPage, useLeadPages, useSubmitMockLead, useUpdateLeadPage } from "../hooks/useLeadPages";
import { usePipelines } from "../hooks/usePipelines";
import {
  useAddCustomQuestion,
  useCustomQuestions,
  useMoveCustomQuestion,
  useRemoveCustomQuestion,
} from "../hooks/useCustomQuestions";
import { useTier } from "../hooks/useTier";
import { useSnack } from "../hooks/useSnack";
import { LEAD_FORM_TEMPLATE } from "../lib/leadFormTemplate";
import LeadCaptureForm from "../components/LeadCaptureForm";

export default function LeadPagePage() {
  const navigate = useNavigate();
  const { tier } = useTier();
  const { data: pages = [], isLoading: pagesLoading } = useLeadPages();
  const { data: pipelines = [], isLoading: pipelinesLoading } = usePipelines();
  const updatePage = useUpdateLeadPage();
  const showSnack = useSnack();

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
    if (!file) return update({ logoDataUrl: null });
    const reader = new FileReader();
    reader.onload = () => update({ logoDataUrl: reader.result as string });
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
            <Button variant="outlined" component="label" size="small" sx={{ alignSelf: "flex-start" }}>
              {page.logoDataUrl ? "Change logo / photo" : "Upload logo / photo"}
              <input type="file" hidden accept="image/*" onChange={(e) => onLogoChange(e.target.files?.[0] ?? null)} />
            </Button>

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
              placeholder="e.g. 1234567890123456"
              value={page.fbPixelId}
              onChange={(e) => update({ fbPixelId: e.target.value })}
              helperText="For custom conversion events — mock only, no pixel actually fires here"
              fullWidth
            />
          </Section>

          <Section title="Form questions">
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Always shown, on every plan:</Typography>
            {[LEAD_FORM_TEMPLATE[pipeline.kind].step1Label, LEAD_FORM_TEMPLATE[pipeline.kind].secondQuestion, "Full name", "WhatsApp number"].map((f) => (
              <Box key={f} sx={{ display: "flex", alignItems: "center", gap: 1, p: "10px 12px", borderRadius: "4px", bgcolor: tokens.hover, color: "text.secondary", fontSize: 14 }}>
                <LockIcon sx={{ fontSize: 16 }} /> {f}
              </Box>
            ))}

            {tier === "free" ? (
              <UpgradeNudge onUpgrade={() => navigate("/upgrade")} />
            ) : (
              <CustomQuestionEditor pageId={page.id} />
            )}
          </Section>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <Section
            title="Live preview"
            action={
              <Typography
                component="a"
                href={`/p/${page.id}`}
                target="_blank"
                rel="noopener"
                sx={{ fontSize: 12.5, color: tokens.primary, textDecoration: "none", textTransform: "none", fontWeight: 500, "&:hover": { textDecoration: "underline" } }}
              >
                Open live preview ↗
              </Typography>
            }
          >
            <PreviewAndSubmit page={page} pipelineKind={pipeline.kind} tier={tier} />
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

function PreviewAndSubmit({ page, pipelineKind, tier }: { page: LeadPage; pipelineKind: PipelineKind; tier: "free" | "paid" }) {
  const { data: customQuestions = [] } = useCustomQuestions(page.id);
  const submitLead = useSubmitMockLead();
  const showSnack = useSnack();
  return (
    <LeadCaptureForm
      page={page}
      pipelineKind={pipelineKind}
      customQuestions={tier === "paid" ? customQuestions : []}
      onSubmit={async ({ name, phone, answers }) => {
        await submitLead.mutateAsync({ pageId: page.id, name, phone, formAnswers: answers });
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
  const shareUrl = shortLinkFor(page);

  function copyLink() {
    navigator.clipboard.writeText(`https://${shareUrl}`);
    showSnack("Link copied");
  }

  async function shareLink() {
    const shareData = { title: page.agentName || page.name, text: page.headline, url: `https://${shareUrl}` };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled the share sheet — nothing to do
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
        <TextField value={`https://${shareUrl}`} fullWidth size="small" slotProps={{ input: { readOnly: true } }} />
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
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "yes_no", label: "Yes / No" },
];

function CustomQuestionEditor({ pageId }: { pageId: string }) {
  const { data: questions = [] } = useCustomQuestions(pageId);
  const addQuestion = useAddCustomQuestion(pageId);
  const removeQuestion = useRemoveCustomQuestion(pageId);
  const moveQuestion = useMoveCustomQuestion(pageId);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<QuestionType>("short_text");
  const [optionsText, setOptionsText] = useState("");

  async function add() {
    if (!label.trim()) return;
    const options = type === "multiple_choice" ? optionsText.split(",").map((o) => o.trim()).filter(Boolean) : undefined;
    await addQuestion.mutateAsync({ label: label.trim(), type, options });
    setLabel("");
    setOptionsText("");
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {questions.map((q, i) => (
        <Box key={q.id} sx={{ display: "flex", alignItems: "center", gap: 1, p: "10px 12px", border: `1px solid ${tokens.divider}`, borderRadius: "6px" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{q.label}</Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {QUESTION_TYPES.find((t) => t.value === q.type)?.label}
              {q.options?.length ? ` — ${q.options.join(", ")}` : ""}
            </Typography>
          </Box>
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
      ))}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: "12px", border: `1px dashed ${tokens.divider}`, borderRadius: "6px" }}>
        <TextField label="Question" size="small" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth />
        <TextField select label="Type" size="small" value={type} onChange={(e) => setType(e.target.value as QuestionType)} fullWidth>
          {QUESTION_TYPES.map((t) => (
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
        <Button startIcon={<AddIcon fontSize="small" />} onClick={add} variant="contained" size="small" sx={{ alignSelf: "flex-start" }}>
          Add question
        </Button>
      </Box>
    </Box>
  );
}
