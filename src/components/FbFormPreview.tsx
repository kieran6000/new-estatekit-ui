import { useMemo, useState } from "react";
import { Box, Chip, Typography } from "@mui/material";
import FacebookIcon from "@mui/icons-material/Facebook";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import { tokens } from "../theme";
import type { FbFormDetail, FbFormQuestion } from "../api/leadPages";

const FB_BLUE = "#1877f2";
const CONTACT_TYPES = new Set(["FULL_NAME", "EMAIL", "PHONE", "FIRST_NAME", "LAST_NAME", "STREET_ADDRESS", "CITY", "ZIP", "COUNTRY", "PROVINCE", "STATE"]);

type Step =
  | { kind: "intro" }
  | { kind: "question"; question: FbFormQuestion }
  | { kind: "contact"; questions: FbFormQuestion[] }
  | { kind: "thanks" };

const STEP_LABEL: Record<Step["kind"], string> = {
  intro: "Intro",
  question: "Custom questions",
  contact: "Contact information",
  thanks: "Message for leads",
};

function contactLabel(type: string, fallback: string): string {
  switch (type) {
    case "FULL_NAME": return "Full name";
    case "FIRST_NAME": return "First name";
    case "LAST_NAME": return "Last name";
    case "EMAIL": return "Email";
    case "PHONE": return "Phone number";
    case "STREET_ADDRESS": return "Street address";
    case "CITY": return "City";
    case "ZIP": return "Postal code";
    case "PROVINCE": case "STATE": return "Province";
    case "COUNTRY": return "Country";
    default: return fallback;
  }
}

export default function FbFormPreview({
  form,
  pageName,
  avatarUrl,
  formName,
  pipelineName,
}: {
  form: FbFormDetail;
  pageName: string;
  avatarUrl?: string | null;
  /** Shown in the merged header above the phone. */
  formName?: string;
  pipelineName?: string;
}) {
  const steps = useMemo<Step[]>(() => {
    const custom = form.questions.filter((q) => !CONTACT_TYPES.has(q.type));
    const contact = form.questions.filter((q) => CONTACT_TYPES.has(q.type));
    const list: Step[] = [{ kind: "intro" }];
    for (const q of custom) list.push({ kind: "question", question: q });
    if (contact.length) list.push({ kind: "contact", questions: contact });
    list.push({ kind: "thanks" });
    return list;
  }, [form]);

  const [i, setI] = useState(0);
  const step = steps[i];
  const total = steps.length;
  const initial = (pageName || "?").trim()[0]?.toUpperCase() ?? "?";
  const ctaText =
    step.kind === "thanks"
      ? form.thank_you_page?.button_text || "Claim My FREE Evaluation"
      : form.context_card?.button_text || "Continue";

  return (
    <Box>
      {/* Merged header: source info + FB chrome */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 2 }}>
        <FacebookIcon sx={{ fontSize: 30, color: FB_BLUE }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {formName || form.name}
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            Facebook instant form{pipelineName ? <> · leads go to <b style={{ color: tokens.ink }}>{pipelineName}</b></> : null}
          </Typography>
        </Box>
        <Chip label="Connected" color="success" size="small" />
      </Box>

      {/* Phone frame */}
      <Box
        sx={{
          width: "100%",
          maxWidth: 340,
          mx: "auto",
          bgcolor: "#e4e6eb",
          borderRadius: "18px",
          overflow: "hidden",
          border: "1px solid #d0d3d9",
          display: "flex",
          flexDirection: "column",
          height: 560,
        }}
      >
        {/* Scrollable card area */}
        <Box sx={{ flex: 1, overflowY: "auto", px: 1.5, pt: 2.5, pb: 1.5 }}>
          <Box sx={{ bgcolor: "#fff", borderRadius: "12px", boxShadow: "0 1px 4px rgba(0,0,0,.12)", px: 2, pt: 2.5, pb: 2, minHeight: 340, display: "flex", flexDirection: "column", alignItems: "stretch" }}>
            {/* Avatar */}
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                bgcolor: avatarUrl ? "#e4e6eb" : FB_BLUE,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 600,
                fontSize: 22,
                overflow: "hidden",
                alignSelf: "center",
                mb: 1,
                flexShrink: 0,
              }}
            >
              {avatarUrl ? <Box component="img" src={avatarUrl} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initial}
            </Box>

            <Typography sx={{ textAlign: "center", fontSize: 12, color: "text.secondary", mb: 1.5 }}>{pageName}</Typography>

            {step.kind === "intro" && (
              <>
                <Typography sx={{ textAlign: "center", fontSize: 17, fontWeight: 700, lineHeight: 1.3, mb: 1.25 }}>
                  {form.context_card?.title || form.name}
                </Typography>
                {(form.context_card?.content || []).map((p, idx) => (
                  <Typography key={idx} sx={{ fontSize: 13.5, color: "#1c1e21", lineHeight: 1.5, mb: 1 }}>
                    {p}
                  </Typography>
                ))}
              </>
            )}

            {step.kind === "question" && (
              <>
                <Typography sx={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35, mb: 1.5 }}>
                  {step.question.label}
                </Typography>
                {step.question.options?.length ? (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {step.question.options.map((o) => (
                      <Box key={o.key} sx={{ display: "flex", alignItems: "center", gap: 1.25, border: "1px solid #ccd0d5", borderRadius: "8px", p: "10px 12px" }}>
                        <Box sx={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid #bcc0c4", flexShrink: 0 }} />
                        <Typography sx={{ fontSize: 13.5 }}>{o.value}</Typography>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Box sx={{ borderBottom: "1px solid #ccd0d5", pb: 0.5 }}>
                    <Typography sx={{ fontSize: 13.5, color: "#90949c" }}>Enter your answer.</Typography>
                  </Box>
                )}
              </>
            )}

            {step.kind === "contact" && (
              <>
                <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 0.5 }}>Contact information</Typography>
                <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2 }}>
                  Where should we send your information?
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {step.questions.map((q) => (
                    <Box key={q.key}>
                      <Typography sx={{ fontSize: 12.5, color: "#606770", mb: 0.25 }}>{contactLabel(q.type, q.label)}</Typography>
                      <Box sx={{ borderBottom: "1px solid #ccd0d5", pb: 0.5 }}>
                        <Typography sx={{ fontSize: 13.5, color: "#90949c" }}>Enter your answer.</Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </>
            )}

            {step.kind === "thanks" && (
              <>
                <Typography sx={{ textAlign: "center", fontSize: 15, fontWeight: 700, mb: 1.25 }}>
                  {form.thank_you_page?.title || "ALMOST DONE:"}
                </Typography>
                <Typography sx={{ fontSize: 13.5, color: "#1c1e21", lineHeight: 1.5, whiteSpace: "pre-line" }}>
                  {form.thank_you_page?.body ||
                    "I'm preparing your information.\n\nMy assistant will give you a quick call to confirm a few details.\n\nTap the button below 👇"}
                </Typography>
                <Typography sx={{ fontSize: 11, color: "#90949c", mt: 2, textAlign: "center" }}>
                  You successfully submitted your responses.
                </Typography>
              </>
            )}
          </Box>
        </Box>

        {/* Sticky CTA */}
        <Box sx={{ flexShrink: 0, bgcolor: "#fff", borderTop: "1px solid #e4e6eb", p: 1.25 }}>
          <Box sx={{ height: 3, borderRadius: 2, bgcolor: "#e4e6eb", mb: 1.25, overflow: "hidden" }}>
            <Box sx={{ height: "100%", width: `${((i + 1) / total) * 100}%`, bgcolor: "#42b72a", transition: "width .2s" }} />
          </Box>
          <Box
            component="button"
            onClick={() => setI((n) => (n >= total - 1 ? 0 : n + 1))}
            sx={{
              width: "100%",
              border: 0,
              bgcolor: FB_BLUE,
              color: "#fff",
              borderRadius: "8px",
              py: 1.25,
              textAlign: "center",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              "&:hover": { bgcolor: "#166fe0" },
            }}
          >
            {ctaText}
          </Box>
        </Box>
      </Box>

      {/* Nav under phone */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 340, mx: "auto", mt: 1 }}>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {STEP_LABEL[step.kind]} · {i + 1} of {total}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.75 }}>
          <NavBtn disabled={i === 0} onClick={() => setI((n) => Math.max(0, n - 1))}>
            <ArrowBackIosNewIcon sx={{ fontSize: 13 }} />
          </NavBtn>
          <NavBtn disabled={i === total - 1} onClick={() => setI((n) => Math.min(total - 1, n + 1))}>
            <ArrowForwardIosIcon sx={{ fontSize: 13 }} />
          </NavBtn>
        </Box>
      </Box>
    </Box>
  );
}

function NavBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      disabled={disabled}
      sx={{
        width: 30,
        height: 30,
        borderRadius: "6px",
        border: "1px solid #ccd0d5",
        bgcolor: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "#bcc0c4" : "#1c1e21",
        opacity: disabled ? 0.5 : 1,
        "&:hover": { bgcolor: disabled ? "#fff" : "#f0f2f5" },
      }}
    >
      {children}
    </Box>
  );
}
