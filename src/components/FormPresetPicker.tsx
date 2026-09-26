import { Box, Paper, Radio, Typography } from "@mui/material";
import { tokens } from "../theme";
import { FORM_PRESETS } from "../lib/formPresets";
import type { FormPresetKey } from "../types";

/** Three filled bars = most friction. Shows the trade-off at a glance. */
function FrictionBars({ level }: { level: number }) {
  return (
    <Box sx={{ display: "flex", gap: "3px", alignItems: "flex-end" }} aria-label={`Friction ${level} of 3`}>
      {[1, 2, 3].map((n) => (
        <Box key={n} sx={{ width: 5, height: 6 + n * 3, borderRadius: "1px", bgcolor: n <= level ? tokens.primary : tokens.divider }} />
      ))}
    </Box>
  );
}

/** Pick one of the friction presets (or none). Used when adding a lead page
 *  and when switching an existing page's preset. */
export default function FormPresetPicker({
  value,
  onChange,
  allowBlank = false,
}: {
  value: FormPresetKey | "blank";
  onChange: (v: FormPresetKey | "blank") => void;
  allowBlank?: boolean;
}) {
  const options = [
    ...FORM_PRESETS.map((p, i) => ({ key: p.key as FormPresetKey | "blank", name: p.name, sop: p.sop, tagline: p.tagline, bestFor: p.bestFor, questions: p.questions.length, level: i + 1 })),
    ...(allowBlank ? [{ key: "blank" as const, name: "Blank form", sop: "", tagline: "Only name and number. Add your own questions.", bestFor: "", questions: 0, level: 0 }] : []),
  ];
  return (
    <Box role="radiogroup" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {options.map((o) => {
        const selected = value === o.key;
        return (
          <Paper
            key={o.key}
            variant="outlined"
            role="radio"
            aria-checked={selected}
            tabIndex={0}
            onClick={() => onChange(o.key)}
            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(o.key); } }}
            sx={{
              display: "flex", alignItems: "flex-start", gap: 1, p: "8px 12px 10px 4px", cursor: "pointer",
              borderColor: selected ? "primary.main" : undefined,
              bgcolor: selected ? tokens.primaryBg : undefined,
              "&:hover": { borderColor: "primary.main" },
            }}
          >
            <Radio checked={selected} tabIndex={-1} size="small" sx={{ mt: -0.25 }} />
            <Box sx={{ flex: 1, minWidth: 0, pt: 0.75 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography sx={{ fontSize: 14.5, fontWeight: 500 }}>{o.name}</Typography>
                {o.level > 0 && <FrictionBars level={o.level} />}
                <Typography sx={{ fontSize: 12, color: "text.secondary", ml: "auto", whiteSpace: "nowrap" }}>
                  {o.questions ? `${o.questions} question${o.questions > 1 ? "s" : ""}` : ""}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.25, lineHeight: 1.45 }}>{o.tagline}</Typography>
              {o.bestFor && (
                <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>
                  Best for: {o.bestFor}
                  {o.sop && <Box component="span" sx={{ color: "text.disabled" }}> · SOP: {o.sop}</Box>}
                </Typography>
              )}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
