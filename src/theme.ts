import { createTheme } from "@mui/material/styles";

// Old-Android / Material Design 2 look. Deliberately plain — flat surfaces,
// 4px radius, thin dividers, uppercase text-buttons.
//
// Dark mode (operator-only) is driven entirely by CSS variables: every token
// below resolves to a `--ek-*` custom property whose light/dark values live in
// index.css, keyed off MUI's `data-mui-color-scheme` attribute. Because the
// call sites reference these vars (not literal hex), the whole app flips with
// one attribute change and light mode stays byte-for-byte identical.
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

// MUI palette per colour scheme. These must be real values (MUI computes
// hover/contrast variants from them), so they can't be CSS vars — but they
// switch automatically via colorSchemes.
const lightPalette = {
  primary: { main: "#1976d2", dark: "#1565c0", contrastText: "#fff" },
  success: { main: "#2e7d32", dark: "#1b5e20" },
  error: { main: "#c62828" },
  background: { default: "#f1f3f4", paper: "#ffffff" },
  text: { primary: "rgba(0,0,0,.87)", secondary: "rgba(0,0,0,.60)", disabled: "rgba(0,0,0,.38)" },
  divider: "#e0e0e0",
} as const;

const darkPalette = {
  primary: { main: "#8ab4f8", dark: "#aecbfa", contrastText: "rgba(0,0,0,.87)" },
  success: { main: "#66bb6a", dark: "#43a047" },
  error: { main: "#f28b82" },
  background: { default: "#121212", paper: "#1e1e1e" },
  text: { primary: "rgba(255,255,255,.90)", secondary: "rgba(255,255,255,.64)", disabled: "rgba(255,255,255,.40)" },
  divider: "rgba(255,255,255,.13)",
} as const;

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "data" },
  colorSchemes: {
    light: { palette: lightPalette },
    dark: { palette: darkPalette },
  },
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
