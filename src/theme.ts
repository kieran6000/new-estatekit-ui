import { createTheme } from "@mui/material/styles";

// Old-Android / Material Design 2 look, ported 1:1 from the prototype's CSS
// custom properties. Deliberately plain — flat surfaces, 4px radius, thin
// dividers, uppercase text-buttons. Do not add elevation/gradients/rounding
// beyond what's here.
export const tokens = {
  primary: "#1976d2",
  primaryDark: "#1565c0",
  primaryBg: "#e8f0fe",
  green: "#2e7d32",
  greenDark: "#1b5e20",
  greenCall: "#43a047",
  red: "#c62828",
  amberTint: "#fff8e1",
  bg: "#f1f3f4",
  surface: "#ffffff",
  divider: "#e0e0e0",
  divider2: "#eeeeee",
  hover: "#f5f5f5",
  ink: "rgba(0,0,0,.87)",
  ink2: "rgba(0,0,0,.60)",
  ink3: "rgba(0,0,0,.38)",
  railBg: "#1b2431",
  railBorder: "#101722",
  railHover: "#26313f",
  railActive: "#2563eb",
  railInk: "#aeb9c7",
};

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: tokens.primary, dark: tokens.primaryDark, contrastText: "#fff" },
    success: { main: tokens.green, dark: tokens.greenDark },
    error: { main: tokens.red },
    background: { default: tokens.bg, paper: tokens.surface },
    text: { primary: tokens.ink, secondary: tokens.ink2, disabled: tokens.ink3 },
    divider: tokens.divider,
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
