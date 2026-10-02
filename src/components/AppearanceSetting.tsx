import { Box, ButtonBase, Card, CardContent, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { tokens } from "../theme";
import { useThemeMode, type ThemePreference } from "../lib/themeMode";

// Light / Dark / Match device, on the Account page. Saved on this device
// (src/lib/themeMode.tsx), so a phone and a laptop can differ.

// Each tile shows a tiny picture of the mode, so its colours are that
// mode's own whatever the page is showing now.
const SWATCH = {
  light: { page: "#f1f3f4", card: "#ffffff", line: "#dadce0", accent: "#1976d2" },
  dark: { page: "#101418", card: "#181c21", line: "#3a424b", accent: "#8ab4f8" },
};

function Mini({ mode }: { mode: "light" | "dark" }) {
  const c = SWATCH[mode];
  return (
    <Box sx={{ bgcolor: c.page, p: "8px", height: "100%", display: "flex", gap: "6px" }}>
      <Box sx={{ width: 14, borderRadius: "3px", bgcolor: "#1b2431" }} />
      <Box sx={{ flex: 1, bgcolor: c.card, borderRadius: "3px", p: "6px", display: "grid", gap: "4px", alignContent: "start" }}>
        <Box sx={{ height: 5, width: "60%", borderRadius: 2, bgcolor: c.accent }} />
        <Box sx={{ height: 4, width: "90%", borderRadius: 2, bgcolor: c.line }} />
        <Box sx={{ height: 4, width: "75%", borderRadius: 2, bgcolor: c.line }} />
      </Box>
    </Box>
  );
}

const OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Always light" },
  { value: "dark", label: "Dark", hint: "Easier on the eyes at night" },
  { value: "system", label: "Match device", hint: "Follows your phone or computer" },
];

export default function AppearanceSetting() {
  const { preference, setPreference } = useThemeMode();

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box>
          <Typography variant="subtitle1" component="h2" id="appearance-label" sx={{ fontWeight: 600 }}>
            Appearance
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Saved on this device. Your lead pages always stay light for visitors.
          </Typography>
        </Box>
        <Box role="radiogroup" aria-labelledby="appearance-label" sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.25 }}>
          {OPTIONS.map((o) => {
            const on = preference === o.value;
            return (
              <ButtonBase
                key={o.value}
                role="radio"
                aria-checked={on}
                onClick={() => setPreference(o.value)}
                focusRipple
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  textAlign: "left",
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: `2px solid ${on ? tokens.primary : tokens.divider}`,
                  bgcolor: on ? tokens.primaryBg : "background.paper",
                  transition: "border-color .15s, background-color .15s",
                  "&:hover": { borderColor: on ? tokens.primary : tokens.outline },
                  "&.Mui-focusVisible": { outline: `2px solid ${tokens.primary}`, outlineOffset: 2 },
                }}
              >
                <Box sx={{ height: 64, position: "relative", borderBottom: `1px solid ${tokens.divider}` }}>
                  {o.value === "system" ? (
                    // Half light, half dark.
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100%" }}>
                      <Box sx={{ overflow: "hidden" }}><Mini mode="light" /></Box>
                      <Box sx={{ overflow: "hidden" }}><Mini mode="dark" /></Box>
                    </Box>
                  ) : (
                    <Mini mode={o.value} />
                  )}
                  {on && <CheckCircleIcon sx={{ position: "absolute", top: 4, right: 4, fontSize: 18, color: tokens.primary, bgcolor: tokens.surface, borderRadius: "50%" }} />}
                </Box>
                <Box sx={{ px: 1, py: 0.75 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: on ? tokens.primary : "text.primary" }}>{o.label}</Typography>
                  <Typography sx={{ fontSize: 11.5, color: "text.secondary", lineHeight: 1.3 }}>{o.hint}</Typography>
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}
