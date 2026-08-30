import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import {
  AppBar,
  Box,
  Button,
  IconButton,
  MenuItem,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import LockIcon from "@mui/icons-material/Lock";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineRounded";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { tokens } from "../theme";
import { ACCENT_PRESETS, type LeadPageConfig, type QuestionType } from "../types";
import { slugFor } from "../api/leadPageConfig";
import { useLeadPageConfig, useSaveLeadPageConfig, useSubmitMockLead } from "../hooks/useLeadPageConfig";
import {
  useAddCustomQuestion,
  useCustomQuestions,
  useMoveCustomQuestion,
  useRemoveCustomQuestion,
} from "../hooks/useCustomQuestions";
import { useTier } from "../hooks/useTier";
import { useSnack } from "../hooks/useSnack";
import SellerLeadForm from "../components/SellerLeadForm";

const FIXED_FIELDS = ["Full name", "Property address", "WhatsApp number"];

export default function LeadPagePage() {
  const navigate = useNavigate();
  const { tier } = useTier();
  const { data: savedConfig } = useLeadPageConfig();
  const saveConfig = useSaveLeadPageConfig();
  const submitLead = useSubmitMockLead();
  const { data: customQuestions = [] } = useCustomQuestions();
  const showSnack = useSnack();

  const [config, setConfig] = useState<LeadPageConfig | null>(null);
  useEffect(() => {
    if (savedConfig && !config) setConfig(savedConfig);
  }, [savedConfig, config]);

  const qrRef = useRef<HTMLCanvasElement>(null);

  if (!config) return null;

  function update(patch: Partial<LeadPageConfig>) {
    const next = { ...config!, ...patch };
    setConfig(next);
    saveConfig.mutate(next);
  }

  function onLogoChange(file: File | null) {
    if (!file) return update({ logoDataUrl: null });
    const reader = new FileReader();
    reader.onload = () => update({ logoDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  const url = slugFor(config.agentName);

  function copyLink() {
    navigator.clipboard.writeText(`https://${url}`);
    showSnack("Link copied");
  }

  function downloadQr() {
    const canvas = qrRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${url}-qr.png`;
    a.click();
  }

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/home")}>
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>My Lead Page</Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3, p: 2, maxWidth: 1100, mx: "auto" }}>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <Section title="Page details">
            <TextField label="Agent name" value={config.agentName} onChange={(e) => update({ agentName: e.target.value })} fullWidth />
            <TextField label="Headline" value={config.headline} onChange={(e) => update({ headline: e.target.value })} fullWidth multiline minRows={2} />
            <TextField label="Suburb / area" value={config.suburb} onChange={(e) => update({ suburb: e.target.value })} fullWidth />
            <TextField label="Phone" value={config.phone} onChange={(e) => update({ phone: e.target.value })} fullWidth />
            <Button variant="outlined" component="label" size="small" sx={{ alignSelf: "flex-start" }}>
              {config.logoDataUrl ? "Change logo / photo" : "Upload logo / photo"}
              <input type="file" hidden accept="image/*" onChange={(e) => onLogoChange(e.target.files?.[0] ?? null)} />
            </Button>

            <Box>
              <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>Accent color</Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                {ACCENT_PRESETS.map((preset) => (
                  <Box
                    key={preset.key}
                    component="button"
                    onClick={() => update({ accent: preset.key })}
                    title={preset.label}
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      bgcolor: preset.value,
                      border: config.accent === preset.key ? `3px solid ${tokens.ink}` : "3px solid transparent",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Section>

          <Section title="Form questions">
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Always shown first, on every plan:</Typography>
            {FIXED_FIELDS.map((f) => (
              <Box key={f} sx={{ display: "flex", alignItems: "center", gap: 1, p: "10px 12px", borderRadius: "4px", bgcolor: tokens.hover, color: "text.secondary", fontSize: 14 }}>
                <LockIcon sx={{ fontSize: 16 }} /> {f}
              </Box>
            ))}

            {tier === "free" ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: "14px", border: `1px dashed ${tokens.divider}`, borderRadius: "6px" }}>
                <LockIcon sx={{ color: "text.disabled" }} />
                <Typography sx={{ flex: 1, fontSize: 13.5, color: "text.secondary" }}>Add custom questions with paid</Typography>
                <Button size="small" variant="contained" onClick={() => navigate("/upgrade")}>
                  Upgrade
                </Button>
              </Box>
            ) : (
              <CustomQuestionEditor />
            )}
          </Section>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <Section title="Live preview">
            <SellerLeadForm
              config={config}
              customQuestions={tier === "paid" ? customQuestions : []}
              onSubmit={async (values) => {
                await submitLead.mutateAsync(values);
                showSnack("Form submitted (demo) — a real lead lands in Leads once connected");
              }}
            />
          </Section>

          <Section title="Share">
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TextField value={`https://${url}`} fullWidth size="small" slotProps={{ input: { readOnly: true } }} />
              <Button variant="outlined" startIcon={<ContentCopyIcon fontSize="small" />} onClick={copyLink}>
                Copy
              </Button>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1 }}>
              <Box sx={{ p: 1.5, border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "#fff" }}>
                <QRCodeCanvas ref={qrRef} value={`https://${url}`} size={120} />
              </Box>
              <Button variant="outlined" startIcon={<DownloadIcon fontSize="small" />} onClick={downloadQr}>
                Download QR
              </Button>
            </Box>
          </Section>
        </Box>
      </Box>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</Typography>
      {children}
    </Box>
  );
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "short_text", label: "Short text" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "yes_no", label: "Yes / No" },
];

function CustomQuestionEditor() {
  const { data: questions = [] } = useCustomQuestions();
  const addQuestion = useAddCustomQuestion();
  const removeQuestion = useRemoveCustomQuestion();
  const moveQuestion = useMoveCustomQuestion();
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
