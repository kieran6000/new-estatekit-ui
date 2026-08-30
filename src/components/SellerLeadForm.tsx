import { useState } from "react";
import { Box, Button, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { CustomQuestion, LeadPageConfig } from "../types";
import { ACCENT_PRESETS } from "../types";

function accentValue(accent: LeadPageConfig["accent"]): string {
  return ACCENT_PRESETS.find((a) => a.key === accent)?.value ?? ACCENT_PRESETS[0].value;
}

/**
 * The one fixed "What's your home worth?" landing-page template — hero +
 * seller form. Used both as the live preview on /lead-page and (in spirit)
 * as what a seller would see on the published page. Layout never changes;
 * only `config`/`customQuestions` do.
 */
export default function SellerLeadForm({
  config,
  customQuestions,
  onSubmit,
}: {
  config: LeadPageConfig;
  customQuestions: CustomQuestion[];
  onSubmit: (values: { name: string; address: string; phone: string }) => void;
}) {
  const accent = accentValue(config.accent);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});

  return (
    <Box sx={{ border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden", bgcolor: "#fff" }}>
      <Box sx={{ bgcolor: accent, color: "#fff", p: "28px 24px" }}>
        {config.logoDataUrl && (
          <Box component="img" src={config.logoDataUrl} alt="" sx={{ height: 40, mb: 1.5, borderRadius: "6px" }} />
        )}
        <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{config.headline || "What's your home worth?"}</Typography>
        <Typography sx={{ fontSize: 14, opacity: 0.9, mt: 0.75 }}>
          {config.agentName || "Your agent"} · {config.suburb || "Your area"}
        </Typography>
      </Box>

      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name, address, phone });
        }}
        sx={{ p: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 2 }}
      >
        <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required />
        <TextField label="Property address" value={address} onChange={(e) => setAddress(e.target.value)} fullWidth required />
        <TextField label="WhatsApp number" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth required />

        {customQuestions.map((q) => (
          <CustomQuestionField key={q.id} question={q} value={custom[q.id] ?? ""} onChange={(v) => setCustom((c) => ({ ...c, [q.id]: v }))} />
        ))}

        <Button type="submit" variant="contained" size="large" sx={{ bgcolor: accent, "&:hover": { bgcolor: accent, filter: "brightness(0.9)" } }}>
          Get my free estimate
        </Button>
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
