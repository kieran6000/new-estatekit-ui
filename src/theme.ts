import { createTheme } from "@mui/material/styles";

// Old-Android / Material Design 2 look. Deliberately plain — flat surfaces,
// 4px radius, thin dividers, uppercase text-buttons.
//
// Tokens are still CSS variables (see index.css) rather than literal hex —
// that's just a convenient single place to tweak a colour, not a light/dark
// switch. The app is light-only.
export const tokens = {
  primary: "var(--ek-primary)",
  primaryDark: "var(--ek-primaryDark)",
  primaryBg: "var(--ek-primaryBg)",
  green: "var(--ek-green)",
  greenDark: "var(--ek-greenDark)",
  greenCall: "var(--ek-greenCall)",
  red: "var(--ek-red)",
  amberTint: "var(--ek-amberTint)",
  bg: "var(--ek-bg)",
  surface: "var(--ek-surface)",
  surface2: "var(--ek-surface2)",
  divider: "var(--ek-divider)",
  divider2: "var(--ek-divider2)",
  hover: "var(--ek-hover)",
  ink: "var(--ek-ink)",
  ink2: "var(--ek-ink2)",
  ink3: "var(--ek-ink3)",
  // The sidebar rail is dark in both modes — its values don't change.
  railBg: "#1b2431",
  railBorder: "#101722",
  railHover: "#26313f",
  railActive: "#2563eb",
  railInk: "#aeb9c7",
};

// MUI's palette. Real values (MUI computes hover/contrast variants from
// them), so they can't be CSS vars like tokens.* above.
const lightPalette = {
  primary: { main: "#1976d2", dark: "#1565c0", contrastText: "#fff" },
  success: { main: "#2e7d32", dark: "#1b5e20" },
  error: { main: "#c62828" },
  background: { default: "#f1f3f4", paper: "#ffffff" },
  text: { primary: "rgba(0,0,0,.87)", secondary: "rgba(0,0,0,.60)", disabled: "rgba(0,0,0,.38)" },
  divider: "#e0e0e0",
} as const;

export const theme = createTheme({
  palette: lightPalette,
  shape: { borderRadius: 4 },
  typography: {
    fontFamily: 'Roboto, -apple-system, "Segoe UI", Arial, sans-serif',
    fontSize: 14,
    button: { textTransform: "uppercase", fontWeight: 500, letterSpacing: "0.06em", fontSize: "0.8125rem" },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 4, boxShadow: "none" },
        contained: { boxShadow: "none", "&:hover": { boxShadow: "none" } },
      },
      defaultProps: { disableElevation: true },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: "none" } },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: tokens.surface, color: tokens.ink, boxShadow: "none", borderBottom: `1px solid ${tokens.divider}` },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 16 } },
    },
    MuiTableCell: {
      styleOverrides: { root: { borderBottom: `1px solid ${tokens.divider2}` } },
    },
  },
});
