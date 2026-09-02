import { useState } from "react";
import { Box, Button, List, ListItemButton, ListItemText, TextField, Typography } from "@mui/material";
import { LEAD_FORM_TEMPLATE } from "../lib/leadFormTemplate";
import type { CustomQuestion, LeadPage, PipelineKind } from "../types";

type Phase = "intro" | "steps" | "done";

type StepDef =
  | { kind: "step1" }
  | { kind: "step2" }
  | { kind: "custom"; question: CustomQuestion }
  | { kind: "contact" };

function phoneIsValid(v: string): boolean {
  const digits = v.replace(/[^\d]/g, "");
  return digits.length >= 9 && digits.length <= 13;
}

/**
 * The one fixed landing-page template, in two flavours picked by pipeline
 * kind — a plain branded header, an optional intro screen, then one question
 * per step (choice-type questions auto-advance on tap). Used both as the
 * live preview on My Page and as what a visitor sees on the published page.
 * Layout never changes; only `page`/`customQuestions` do.
 */
export default function LeadCaptureForm({
  page,
  pipelineKind,
  customQuestions,
  onSubmit,
}: {
  page: LeadPage;
  pipelineKind: PipelineKind;
  customQuestions: CustomQuestion[];
  onSubmit: (values: { name: string; phone: string; answers: { q: string; a: string }[] }) => void;
}) {
  const t = LEAD_FORM_TEMPLATE[pipelineKind];
  const [phase, setPhase] = useState<Phase>(page.showIntro ? "intro" : "steps");
  const [step1, setStep1] = useState("");
  const [step2, setStep2] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [submittedName, setSubmittedName] = useState("");

  const steps: StepDef[] = [
    { kind: "step1" },
    { kind: "step2" },
    ...customQuestions.map((question) => ({ kind: "custom" as const, question })),
    { kind: "contact" },
  ];
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const isFirst = stepIndex === 0;

  function goNext() {
    setError("");
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }
  function goPrev() {
    setError("");
    setStepIndex((i) => Math.max(i - 1, 0));
  }
  function submit() {
    const answers = [
      { q: t.step1Label, a: step1 },
      { q: t.secondQuestion, a: step2 },
      ...customQuestions.map((q) => ({ q: q.label, a: custom[q.id] ?? "" })),
    ];
    onSubmit({ name, phone, answers });
    setSubmittedName(name.split(" ")[0] || "there");
    setPhase("done");
  }

  function handleNext() {
    if (step.kind === "step1" && step1.trim().length < 3) {
      setError(`Please enter your ${t.step1Label.toLowerCase()}.`);
      return;
    }
    if (step.kind === "contact") {
      if (name.trim().length < 2) {
        setError("Please enter your full name.");
        return;
      }
      if (!phoneIsValid(phone)) {
        setError("Please enter a valid WhatsApp number.");
        return;
      }
      submit();
      return;
    }
    goNext();
  }

  function pickChoice(setValue: (v: string) => void, value: string) {
    setValue(value);
    // Auto-advance: a tap on a choice is itself the "next" action — no extra button press.
    setError("");
    if (isLast) submit();
    else setStepIndex((i) => i + 1);
  }

  return (
    <Box sx={{ border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden", bgcolor: "#fff" }}>
      <Box sx={{ bgcolor: page.accentColor, color: "#fff", p: "14px 20px", textAlign: "center" }}>
        {page.logoDataUrl ? (
          <Box component="img" src={page.logoDataUrl} alt="" sx={{ height: 28, borderRadius: "4px" }} />
        ) : (
          <Typography sx={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {page.agentName || page.name}
          </Typography>
        )}
      </Box>

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
              onClick={() => setPhase("steps")}
              sx={{ mt: 3, bgcolor: page.accentColor, "&:hover": { bgcolor: page.accentColor, filter: "brightness(0.9)" } }}
            >
              Get Started →
            </Button>
          </Box>
        )}

        {phase === "steps" && (
          <>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Step {stepIndex + 1} of {steps.length}
            </Typography>

            {step.kind === "step1" && (
              <Box sx={{ mt: 1.5 }}>
                <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{t.step1Label}</Typography>
                <TextField
                  placeholder={t.step1Placeholder}
                  value={step1}
                  onChange={(e) => setStep1(e.target.value)}
                  fullWidth
                  autoFocus
                  error={!!error}
                  helperText={error}
                  sx={{ mt: 1.5 }}
                />
              </Box>
            )}

            {step.kind === "step2" && (
              <ChoiceStep question={t.secondQuestion} options={t.secondOptions} value={step2} onPick={(v) => pickChoice(setStep2, v)} />
            )}

            {step.kind === "custom" && (
              <CustomQuestionStep
                question={step.question}
                value={custom[step.question.id] ?? ""}
                onChange={(v) => setCustom((c) => ({ ...c, [step.question.id]: v }))}
                onPickChoice={(v) => pickChoice((val) => setCustom((c) => ({ ...c, [step.question.id]: val })), v)}
              />
            )}

            {step.kind === "contact" && (
              <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>What's your name?</Typography>
                  <TextField placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} fullWidth autoFocus />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>WhatsApp number</Typography>
                  <TextField
                    placeholder="082 000 0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    fullWidth
                    error={!!error}
                    helperText={error}
                  />
                </Box>
              </Box>
            )}

            {(step.kind === "step1" || step.kind === "contact" || (step.kind === "custom" && step.question.type === "short_text")) && (
              <Button
                variant="contained"
                size="large"
                fullWidth
                onClick={handleNext}
                sx={{ mt: 3, bgcolor: page.accentColor, "&:hover": { bgcolor: page.accentColor, filter: "brightness(0.9)" } }}
              >
                {isLast ? page.ctaLabel : "Next Step →"}
              </Button>
            )}

            {!isFirst && (
              <Typography
                component="button"
                type="button"
                onClick={goPrev}
                sx={{ mt: 1.5, alignSelf: "center", border: 0, bgcolor: "transparent", color: "text.secondary", fontSize: 13, cursor: "pointer" }}
              >
                ← Previous Step
              </Typography>
            )}
          </>
        )}

        {phase === "done" && (
          <Box sx={{ textAlign: "center", m: "auto 0" }}>
            <Typography sx={{ fontSize: 20, fontWeight: 700 }}>
              {page.thankYouHeadline.replace("{name}", submittedName)}
            </Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1 }}>{page.thankYouSubtext}</Typography>
          </Box>
        )}
      </Box>
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

function CustomQuestionStep({
  question,
  value,
  onChange,
  onPickChoice,
}: {
  question: CustomQuestion;
  value: string;
  onChange: (v: string) => void;
  onPickChoice: (v: string) => void;
}) {
  if (question.type === "multiple_choice") {
    return <ChoiceStep question={question.label} options={question.options ?? []} value={value} onPick={onPickChoice} />;
  }
  if (question.type === "yes_no") {
    return <ChoiceStep question={question.label} options={["Yes", "No"]} value={value} onPick={onPickChoice} />;
  }
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{question.label}</Typography>
      <TextField value={value} onChange={(e) => onChange(e.target.value)} fullWidth autoFocus sx={{ mt: 1.5 }} />
    </Box>
  );
}
