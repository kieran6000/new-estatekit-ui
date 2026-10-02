import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

// Light / dark mode for the dashboard.
//
// - The choice ("light" | "dark" | "system") is saved per device in
//   localStorage, so it applies on the login screen too, before anyone is
//   signed in. "system" follows the phone or computer and updates live.
// - The scheme in force is the data-theme attribute on <html>. Both colour
//   systems key off it: the --ek-* tokens (index.css) and MUI's palette
//   (theme.ts). The inline script in index.html sets it before first paint,
//   so a dark-mode user never sees a white flash; keep the two in step.
// - Pages the public sees (lead pages, thank-you, sold listings, seller
//   plans, signup, privacy) and the printable weekly report are always
//   light: they're the agent's brand, not the agent's dashboard, and a
//   visitor's page must not change because the agent prefers dark.

export type ThemePreference = "light" | "dark" | "system";
export type ColorScheme = "light" | "dark";

export const THEME_STORAGE_KEY = "ek-theme";

/** Paths that always render light. Mirrored in index.html's inline script. */
export const ALWAYS_LIGHT = /^\/(p|r|thank-you|privacy|start|sold|plan|report)(\/|$)/;

// The browser bar colour on phones, matching the top of the app.
const THEME_COLOR: Record<ColorScheme, string> = { light: "#1976d2", dark: "#181c21" };

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // Private mode or blocked storage: fall through to the default.
  }
  return "light";
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function applyScheme(scheme: ColorScheme) {
  const root = document.documentElement;
  if (root.getAttribute("data-theme") !== scheme) root.setAttribute("data-theme", scheme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[scheme]);
}

interface ThemeModeValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** The scheme on screen right now (always "light" on public pages). */
  scheme: ColorScheme;
}

const ThemeModeContext = createContext<ThemeModeValue | null>(null);

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [preference, setPref] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Follow the device live while on "system".
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Another tab changed the setting: follow it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) setPref(readPreference());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const scheme: ColorScheme = ALWAYS_LIGHT.test(pathname)
    ? "light"
    : preference === "system" ? (systemDark ? "dark" : "light") : preference;

  // Layout effect: switch before the browser paints the new route.
  useLayoutEffect(() => applyScheme(scheme), [scheme]);

  const setPreference = useCallback((p: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      // Still applies for this visit.
    }
    setPref(p);
  }, []);

  const value = useMemo(() => ({ preference, setPreference, scheme }), [preference, setPreference, scheme]);
  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error("useThemeMode must be used inside ThemeModeProvider");
  return ctx;
}
