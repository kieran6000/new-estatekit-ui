import { createTheme } from "@mui/material/styles";

// The theme runs on CSS variables (cssVariables below); this tells the types.
declare module "@mui/material/styles" {
  interface CssThemeVariables {
    enabled: true;
  }
}

// Old-Android / Material Design 2 look. Deliberately plain — flat surfaces,
// 4px radius, thin dividers, uppercase text-buttons.
//
// Light and dark. Every colour lives in one of two places, both switched by
// the `data-theme` attribute on <html> (set by src/lib/themeMode.tsx):
//  - tokens.* below are CSS variables defined in index.css, light and dark.
//  - MUI's palette (colorSchemes below) becomes --mui-* CSS variables.
// So a component never checks the mode: it uses a token or a palette key and
// the right colour arrives. A literal hex in a component is a dark-mode bug,
// unless it sits on a surface that is the same in both modes (the sidebar
// rail, a brand-coloured button, a printed report, a public lead page).
export const tokens = {
  primary: "var(--ek-primary)",
  primaryDark: "var(--ek-primaryDark)",
  primaryBg: "var(--ek-primaryBg)",
  primaryBorder: "var(--ek-primaryBorder)",
  /** Text and icons on a primary-filled surface. */
  onPrimary: "var(--ek-onPrimary)",
  green: "var(--ek-green)",
  greenDark: "var(--ek-greenDark)",
  /** The Call button fill. Mid green so white text reads in both modes. */
  greenCall: "var(--ek-greenCall)",
  greenCallHover: "var(--ek-greenCallHover)",
  greenTint: "var(--ek-greenTint)",
  greenBorder: "var(--ek-greenBorder)",
  red: "var(--ek-red)",
  redTint: "var(--ek-redTint)",
  redBorder: "var(--ek-redBorder)",
  /** Amber text and icons (warnings, "due"). */
  amber: "var(--ek-amber)",
  amberTint: "var(--ek-amberTint)",
  amberBorder: "var(--ek-amberBorder)",
  orange: "var(--ek-orange)",
  purple: "var(--ek-purple)",
  purpleTint: "var(--ek-purpleTint)",
  teal: "var(--ek-teal)",
  bg: "var(--ek-bg)",
  surface: "var(--ek-surface)",
  surface2: "var(--ek-surface2)",
  /** Menus, popovers, dialogs: one step lighter than surface in dark mode. */
  raised: "var(--ek-raised)",
  divider: "var(--ek-divider)",
  divider2: "var(--ek-divider2)",
  /** Borders of inputs and controls: 3:1 against the surface (WCAG 1.4.11). */
  outline: "var(--ek-outline)",
  /** Decorative lines (builder connectors, dot grid): softer than outline. */
  line: "var(--ek-line)",
  hover: "var(--ek-hover)",
  ink: "var(--ek-ink)",
  ink2: "var(--ek-ink2)",
  ink3: "var(--ek-ink3)",
  /** Card shadow: soft in light, a darker edge in dark where shadows vanish. */
  shadow: "var(--ek-shadow)",
  scrim: "var(--ek-scrim)",
  // The sidebar rail is dark in both modes — its values don't change.
  railBg: "#1b2431",
  railBorder: "#101722",
  railHover: "#26313f",
  railActive: "#2563eb",
  railInk: "#aeb9c7",
};

// MUI's palette per scheme. Real values (MUI computes hover/contrast
// variants from them), mirrored by the --ek-* tokens in index.css.
const lightPalette = {
  // Primary is a shade deeper than Material's #1976d2 so blue text passes
  // 4.5:1 on the grey page as well as on white cards.
  primary: { main: "#1565c0", dark: "#0d47a1", contrastText: "#fff" },
  success: { main: "#2e7d32", dark: "#1b5e20", contrastText: "#fff" },
  error: { main: "#c62828", contrastText: "#fff" },
  warning: { main: "#8a5300", contrastText: "#fff" },
  background: { default: "#f1f3f4", paper: "#ffffff" },
  text: { primary: "rgba(0,0,0,.87)", secondary: "rgba(0,0,0,.60)", disabled: "rgba(0,0,0,.38)" },
  divider: "#e0e0e0",
};

// Dark follows Material's dark-theme rules:
// - No pure black: a blue-grey base, and surfaces get lighter as they rise
//   (page < card < menu), since shadows don't show on dark.
// - Desaturated, lighter accents (blue 200-ish) so they pass 4.5:1 on the
//   surfaces, with dark text on filled buttons.
// - Off-white text at 92 / 70 / 55 % — never pure white on near-black, which
//   glares. Every pair is checked to WCAG AA by scripts/check-contrast.mjs.
const darkPalette = {
  primary: { main: "#8ab4f8", dark: "#aecbfa", light: "#d2e3fc", contrastText: "#0b1a2e" },
  success: { main: "#81c995", dark: "#a8dab5", contrastText: "#0d2414" },
  error: { main: "#f28b82", dark: "#f6aea9", contrastText: "#2b0b08" },
  warning: { main: "#fdd663", dark: "#fde293", contrastText: "#2b2005" },
  info: { main: "#8ab4f8", contrastText: "#0b1a2e" },
  secondary: { main: "#c58af9", contrastText: "#1f0b33" },
  background: { default: "#101418", paper: "#181c21" },
  text: { primary: "rgba(255,255,255,.92)", secondary: "rgba(255,255,255,.70)", disabled: "rgba(255,255,255,.45)" },
  divider: "#2f363e",
  action: {
    active: "rgba(255,255,255,.70)",
    hover: "rgba(255,255,255,.07)",
    selected: "rgba(255,255,255,.12)",
    disabled: "rgba(255,255,255,.38)",
    disabledBackground: "rgba(255,255,255,.12)",
    focus: "rgba(255,255,255,.14)",
  },
};

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: '[data-theme="%s"]' },
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
    // Comfortable tap targets everywhere: MUI's defaults (30px small, 36px
    // medium) felt thin, especially on phones.
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 4, boxShadow: "none", minHeight: 40, padding: "8px 16px" },
        text: { padding: "8px 12px" },
        sizeSmall: { minHeight: 36, padding: "6px 14px", "&.MuiButton-text": { padding: "6px 10px" } },
        sizeLarge: { minHeight: 48, padding: "10px 22px" },
        contained: { boxShadow: "none", "&:hover": { boxShadow: "none" } },
      },
      defaultProps: { disableElevation: true },
    },
    MuiIconButton: {
      styleOverrides: {
        sizeSmall: { padding: 8 },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        sizeSmall: { minHeight: 36, padding: "6px 12px" },
      },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: "none" } },
    },
    // Floating surfaces sit one step lighter than cards in dark mode and get
    // a hairline edge, because a shadow alone disappears on a dark page.
    MuiPopover: {
      styleOverrides: { paper: { backgroundColor: tokens.raised, border: `1px solid ${tokens.divider2}` } },
    },
    MuiDialog: {
      styleOverrides: { paper: { backgroundColor: tokens.raised } },
    },
    MuiDrawer: {
      styleOverrides: { paper: { backgroundColor: tokens.raised } },
    },
    MuiAutocomplete: {
      styleOverrides: { paper: { backgroundColor: tokens.raised } },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: tokens.surface, color: tokens.ink, boxShadow: "none", borderBottom: `1px solid ${tokens.divider}` },
      },
    },
    // Input borders at 3:1 against the surface in both modes (MUI's default
    // 23% grey is ~1.7:1, too faint to find a field by, worst in dark).
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: tokens.outline },
      },
    },
    // Initials always white: avatars sit on a grey, a client's sidebar colour
    // or a brand colour, all mid-to-dark in both modes. (MUI's default ink
    // is the page colour, which vanishes on a dark avatar in dark mode.)
    MuiAvatar: {
      styleOverrides: {
        root: { color: "#fff" },
        colorDefault: { backgroundColor: "var(--ek-avatar)" },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 16 } },
    },
    MuiTableCell: {
      styleOverrides: { root: { borderBottom: `1px solid ${tokens.divider2}` } },
    },
    MuiCssBaseline: {
      styleOverrides: {
        // Chrome paints autofilled inputs pale yellow/blue, unreadable in
        // dark mode. Keep our surface and ink.
        "input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus": {
          WebkitBoxShadow: `0 0 0 100px ${tokens.surface} inset`,
          WebkitTextFillColor: tokens.ink,
          caretColor: tokens.ink,
        },
      },
    },
  },
});
