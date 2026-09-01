import { useState } from "react";
import { Box, Button, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { CustomQuestion, LeadPage, PipelineKind } from "../types";

const SELLER_TIMELINE_OPTIONS = ["Within 3 months", "3–6 months", "6–12 months", "Just researching"];
const BUYER_BUDGET_OPTIONS = ["Under R1m", "R1m – R2m", "R2m – R3.5m", "R3.5m+"];

/** The one fixed question that comes right after the first step, before any
 * custom questions and the contact step — the only thing that differs
 * between a Seller-linked and a Buyer-linked page. No builder: which set
 * shows is decided entirely by the page's pipeline kind. */
export const LEAD_FORM_TEMPLATE: Record<
  PipelineKind,
  { step1Label: string; secondQuestion: string; secondOptions: string[]; cta: string }
> = {
  seller: { step1Label: "Property address", secondQuestion: "When are you looking to sell?", secondOptions: SELLER_TIMELINE_OPTIONS, cta: "Get my free estimate" },
  buyer: { step1Label: "Area you're looking to buy in", secondQuestion: "What's your budget?", secondOptions: BUYER_BUDGET_OPTIONS, cta: "Get matched with listings" },
};

/**
 * The one fixed landing-page template, in two flavours picked by pipeline
 * kind — coloured header + a centered multistep form. Used both as the live
 * preview on My Page and (in spirit) as what a visitor would see on the
 * published page. Layout never changes; only `page`/`customQuestions` do.
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
  const [step1, setStep1] = useState("");
  const [step2, setStep2] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const steps: Array<"step1" | "step2" | "custom" | "contact"> = [
    "step1",
    "step2",
    ...(customQuestions.length ? (["custom"] as const) : []),
    "contact",
  ];
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const isFirst = stepIndex === 0;

  function next() {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }
  function prev() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <Box sx={{ border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden", bgcolor: "#fff" }}>
      <Box sx={{ bgcolor: page.accentColor, color: "#fff", p: "28px 24px" }}>
        {page.logoDataUrl && (
          <Box component="img" src={page.logoDataUrl} alt="" sx={{ height: 40, mb: 1.5, borderRadius: "6px" }} />
        )}
        <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{page.headline || "What's your home worth?"}</Typography>
        <Typography sx={{ fontSize: 14, opacity: 0.9, mt: 0.75 }}>
          {page.agentName || "Your agent"} · {page.suburb || "Your area"}
        </Typography>
      </Box>

      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isLast) {
            next();
            return;
          }
          const answers = [
            { q: t.step1Label, a: step1 },
            { q: t.secondQuestion, a: step2 },
            ...customQuestions.map((q) => ({ q: q.label, a: custom[q.id] ?? "" })),
          ];
          onSubmit({ name, phone, answers });
        }}
        sx={{ p: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 2 }}
      >
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Step {stepIndex + 1} of {steps.length}
        </Typography>

        {step === "step1" && (
          <TextField label={t.step1Label} value={step1} onChange={(e) => setStep1(e.target.value)} fullWidth required autoFocus />
        )}

        {step === "step2" && (
          <TextField select label={t.secondQuestion} value={step2} onChange={(e) => setStep2(e.target.value)} fullWidth required>
            {t.secondOptions.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>
        )}

        {step === "custom" &&
          customQuestions.map((q) => (
            <CustomQuestionField key={q.id} question={q} value={custom[q.id] ?? ""} onChange={(v) => setCustom((c) => ({ ...c, [q.id]: v }))} />
          ))}

        {step === "contact" && (
          <>
            <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required autoFocus />
            <TextField label="WhatsApp number" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth required />
          </>
        )}

        <Box sx={{ display: "flex", gap: 1.5, mt: 0.5 }}>
          {!isFirst && (
            <Button type="button" onClick={prev} sx={{ color: page.accentColor }}>
              Previous step
            </Button>
          )}
          <Button type="submit" variant="contained" size="large" fullWidth={isFirst} sx={{ ml: "auto", bgcolor: page.accentColor, "&:hover": { bgcolor: page.accentColor, filter: "brightness(0.9)" } }}>
            {isLast ? t.cta : "Next step"}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

function CustomQuestionField({
  question,
  value,
  onChange,
}: {
  question: CustomQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  if (question.type === "multiple_choice") {
    return (
      <TextField select label={question.label} value={value} onChange={(e) => onChange(e.target.value)} fullWidth>
        {(question.options ?? []).map((opt) => (
          <MenuItem key={opt} value={opt}>
            {opt}
          </MenuItem>
        ))}
      </TextField>
    );
  }
  if (question.type === "yes_no") {
    return (
      <Box>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 0.5 }}>{question.label}</Typography>
        <ToggleButtonGroup exclusive value={value || null} onChange={(_e, v) => v && onChange(v)}>
          <ToggleButton value="Yes">Yes</ToggleButton>
          <ToggleButton value="No">No</ToggleButton>
        </ToggleButtonGroup>
      </Box>
    );
  }
  return <TextField label={question.label} value={value} onChange={(e) => onChange(e.target.value)} fullWidth />;
}
