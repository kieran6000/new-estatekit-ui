import { useState } from "react";
import { Box, Button, InputAdornment, LinearProgress, List, ListItemButton, ListItemText, TextField, Typography } from "@mui/material";
import EventNoteIcon from "@mui/icons-material/EventNote";
import PlaceIcon from "@mui/icons-material/Place";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlineOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CallIcon from "@mui/icons-material/Call";
import { LEAD_FORM_TEMPLATE } from "../lib/leadFormTemplate";
import type { CustomQuestion, LeadPage, PipelineKind } from "../types";

type Phase = "intro" | "steps" | "done";
type StepDef = { kind: "question"; question: CustomQuestion } | { kind: "contact" };
type FieldErrors = Partial<Record<"question" | "name" | "email" | "phone", string>>;

function phoneIsValid(v: string): boolean {
  const digits = v.replace(/[^\d]/g, "");
  return digits.length >= 9 && digits.length <= 13;
}
function emailIsValid(v: string): boolean {
  return /^\S+@\S+\.\S+$/.test(v);
}

/**
 * The one fixed landing-page template — a plain branded header (visually
 * separate from the card below it, optional — see `showHeader`), an
 * optional intro screen, then one question per step (choice-type questions
 * auto-advance on tap), ending in a fixed Name → Email → Phone step. Every
 * question in `customQuestions` (including the address/timeline ones a page
 * starts with) is a regular, agent-editable row — there's no separate
 * "template step" concept at render time. Used both as the live preview on
 * My Page and as what a visitor sees on the published page.
 */
export default function LeadCaptureForm({
  page,
  pipelineKind,
  customQuestions,
  showHeader = true,
  onSubmit,
}: {
  page: LeadPage;
  pipelineKind: PipelineKind;
  customQuestions: CustomQuestion[];
  /** false when a parent page renders its own full-width navbar instead. */
  showHeader?: boolean;
  onSubmit: (values: { name: string; phone: string; email: string; answers: { q: string; a: string }[] }) => void;
}) {
  const t = LEAD_FORM_TEMPLATE[pipelineKind];
  const nameLabel = page.nameLabel || "What's your name?";
  const phoneLabel = page.phoneLabel || "WhatsApp number";

  const [phase, setPhase] = useState<Phase>(page.showIntro ? "intro" : "steps");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submittedName, setSubmittedName] = useState("");

  const steps: StepDef[] = [...customQuestions.map((question) => ({ kind: "question" as const, question })), { kind: "contact" }];
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex === steps.length - 1;
  const isFirst = stepIndex === 0;
  const progress = ((stepIndex + 1) / steps.length) * 100;

  function goNext() {
    setErrors({});
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }
  function goPrev() {
    setErrors({});
    setStepIndex((i) => Math.max(i - 1, 0));
  }
  function submit() {
    const answerList = customQuestions.map((q) => ({ q: q.label, a: answers[q.id] ?? "" }));
    onSubmit({ name, phone, email: email.trim(), answers: answerList });
    setSubmittedName(name.split(" ")[0] || "there");
    setPhase("done");
  }

  function handleNext() {
    if (step.kind === "question" && (step.question.type === "address" || step.question.type === "short_text")) {
      if (step.question.required && !(answers[step.question.id] ?? "").trim()) {
        setErrors({ question: "This question needs an answer." });
        return;
      }
    }
    if (step.kind === "contact") {
      const nextErrors: FieldErrors = {};
      if (name.trim().length < 2) nextErrors.name = "Please enter your full name.";
      if (!emailIsValid(email.trim())) nextErrors.email = "Please enter a valid email address.";
      if (!phoneIsValid(phone)) nextErrors.phone = "Please enter a valid WhatsApp number.";
      if (Object.keys(nextErrors).length) {
        setErrors(nextErrors);
        return;
      }
      submit();
      return;
    }
    goNext();
  }

  function pickChoice(questionId: string, value: string) {
    setAnswers((a) => ({ ...a, [questionId]: value }));
    // Auto-advance: a tap on a choice is itself the "next" action — no extra button press.
    setErrors({});
    if (isLast) submit();
    else setStepIndex((i) => i + 1);
  }

  return (
    <Box>
      {showHeader && (
        <>
          {/* Header sits apart from the form card, not fused to it. */}
          <Box sx={{ bgcolor: page.accentColor, color: "#fff", p: "14px 20px", textAlign: "center", borderRadius: "8px" }}>
            <HeaderBrand page={page} />
          </Box>
          <Box sx={{ height: 16 }} />
        </>
      )}

      <Box sx={{ border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden", bgcolor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
        {phase === "steps" && (
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ height: 4, bgcolor: "#eee", "& .MuiLinearProgress-bar": { bgcolor: page.accentColor } }}
          />
        )}

        <Box sx={{ p: "28px 24px", minHeight: 260, display: "flex", flexDirection: "column" }}>
          {phase === "intro" && (
            <Box sx={{ textAlign: "center", m: "auto 0" }}>
              <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25 }}>{page.headline || t.defaultHeadline}</Typography>
              {(page.agentName || page.suburb) && (
                <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1 }}>
                  {[page.agentName, page.suburb].filter(Boolean).join(" · ")}
                </Typography>
              )}
              <Button
                variant="contained"
                size="large"
                fullWidth
                endIcon={<ArrowForwardIcon />}
                onClick={() => setPhase("steps")}
                sx={{ mt: 3, bgcolor: page.accentColor, "&:hover": { bgcolor: page.accentColor, filter: "brightness(0.9)" } }}
              >
                Get Started
              </Button>
            </Box>
          )}

          {phase === "steps" && (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <EventNoteIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Step {stepIndex + 1} of {steps.length}
                </Typography>
              </Box>

              {step.kind === "question" && (
                <QuestionStep
                  question={step.question}
                  value={answers[step.question.id] ?? ""}
                  error={errors.question}
                  onChange={(v) => setAnswers((a) => ({ ...a, [step.question.id]: v }))}
                  onPickChoice={(v) => pickChoice(step.question.id, v)}
                />
              )}

              {step.kind === "contact" && (
                <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 2 }}>
                  <Box>
                    <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>{nameLabel}</Typography>
                    <TextField
                      placeholder="Full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      fullWidth
                      autoFocus
                      error={!!errors.name}
                      helperText={errors.name}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start"><PersonOutlineIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment> } }}
                    />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>Email address</Typography>
                    <TextField
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      fullWidth
                      error={!!errors.email}
                      helperText={errors.email}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start"><EmailOutlinedIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment> } }}
                    />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>{phoneLabel}</Typography>
                    <TextField
                      placeholder="082 000 0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      fullWidth
                      error={!!errors.phone}
                      helperText={errors.phone}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start"><WhatsAppIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment> } }}
                    />
                  </Box>
                </Box>
              )}

              {(step.kind === "contact" || (step.kind === "question" && (step.question.type === "address" || step.question.type === "short_text"))) && (
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  endIcon={isLast ? undefined : <ArrowForwardIcon />}
                  onClick={handleNext}
                  sx={{ mt: 3, bgcolor: page.accentColor, "&:hover": { bgcolor: page.accentColor, filter: "brightness(0.9)" } }}
                >
                  {isLast ? page.ctaLabel : "Next Step"}
                </Button>
              )}

              {!isFirst && (
                <Button
                  type="button"
                  onClick={goPrev}
                  startIcon={<ArrowBackIcon fontSize="small" />}
                  sx={{ mt: 1.5, alignSelf: "center", color: "text.secondary", fontSize: 13, textTransform: "none" }}
                >
                  Previous Step
                </Button>
              )}
            </>
          )}

          {phase === "done" && <ThankYouScreen page={page} name={submittedName} />}
        </Box>
      </Box>
    </Box>
  );
}

/** The header's only job is brand identity — logo (or agent/page name text)
 * — never the profile photo, which is reserved for the thank-you screen. */
export function HeaderBrand({ page }: { page: LeadPage }) {
  return page.logoDataUrl ? (
    <Box component="img" src={page.logoDataUrl} alt="" sx={{ height: 28, borderRadius: "4px" }} />
  ) : (
    <Typography sx={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
      {page.agentName || page.name}
    </Typography>
  );
}

function ThankYouScreen({ page, name }: { page: LeadPage; name: string }) {
  const hasPhoto = !!page.profilePhotoDataUrl;
  const size = hasPhoto ? 76 : 96;
  return (
    <Box sx={{ textAlign: "center", m: "auto 0" }}>
      <Box sx={{ position: "relative", width: size, height: size, mx: "auto", mb: 2.5 }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `2px solid ${page.accentColor}`,
            opacity: 0.6,
            animation: "ek-call-ring 1.8s cubic-bezier(0,0,0.2,1) infinite",
            "@keyframes ek-call-ring": {
              "0%": { transform: "scale(0.85)", opacity: 0.6 },
              "100%": { transform: "scale(1.5)", opacity: 0 },
            },
          }}
        />
        {hasPhoto ? (
          <Box
            sx={{
              width: size,
              height: size,
              borderRadius: "50%",
              overflow: "hidden",
              border: "1px solid #e0e0e0",
            }}
          >
            <Box component="img" src={page.profilePhotoDataUrl!} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Box>
        ) : (
          <Box
            sx={{
              width: size,
              height: size,
              borderRadius: "50%",
              bgcolor: page.accentColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CallIcon sx={{ fontSize: 40, color: "#fff" }} />
          </Box>
        )}
        {hasPhoto && (
          <Box
            sx={{
              position: "absolute",
              bottom: -2,
              right: -2,
              width: 28,
              height: 28,
              borderRadius: "50%",
              bgcolor: "#2e7d32",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 0 3px #fff",
            }}
          >
            <CallIcon sx={{ fontSize: 14 }} />
          </Box>
        )}
      </Box>
      <Typography sx={{ fontSize: 20, fontWeight: 700 }}>{page.thankYouHeadline.replace("{name}", name)}</Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1 }}>{page.thankYouSubtext}</Typography>
    </Box>
  );
}

function ChoiceStep({ question, options, value, onPick }: { question: string; options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1.5 }}>{question}</Typography>
      <List disablePadding sx={{ border: "1px solid #e0e0e0", borderRadius: "6px", overflow: "hidden" }}>
        {options.map((opt, i) => (
          <ListItemButton key={opt} selected={value === opt} onClick={() => onPick(opt)} sx={{ borderTop: i ? "1px solid #eee" : 0, py: 1.5 }}>
            <ListItemText primary={opt} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}

function QuestionStep({
  question,
  value,
  error,
  onChange,
  onPickChoice,
}: {
  question: CustomQuestion;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  onPickChoice: (v: string) => void;
}) {
  if (question.type === "multiple_choice") {
    return <ChoiceStep question={question.label} options={question.options ?? []} value={value} onPick={onPickChoice} />;
  }
  if (question.type === "yes_no") {
    return <ChoiceStep question={question.label} options={["Yes", "No"]} value={value} onPick={onPickChoice} />;
  }
  const isAddress = question.type === "address";
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
        {question.label}
        {question.required && !isAddress && <Box component="span" sx={{ color: "error.main" }}> *</Box>}
      </Typography>
      {question.helperText && <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.25 }}>{question.helperText}</Typography>}
      <TextField
        placeholder={isAddress ? "Start typing your answer…" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        fullWidth
        autoFocus
        error={!!error}
        helperText={error}
        slotProps={
          isAddress
            ? { input: { startAdornment: <InputAdornment position="start"><PlaceIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment> } }
            : undefined
        }
        sx={{ mt: 1.5 }}
      />
    </Box>
  );
}
