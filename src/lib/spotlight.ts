import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour.css";

// "Take me to the thing": a page opened with ?focus=<key> scrolls to the
// element marked data-focus="<key>", dims everything else and shows a short
// hint next to it (same Material look as the tour). The element stays
// clickable, and using it closes the hint. Used by the Launch checklist so
// "Add your photo" lands on the photo upload itself, not just the page.

export type FocusKey = "photo" | "logo" | "share" | "call";

const HINTS: Record<FocusKey, { title: string; text: string }> = {
  photo: { title: "Upload your photo", text: "Tap the circle and pick a clear, friendly headshot." },
  logo: { title: "Upload your logo", text: "Tap the square and pick your agency logo. A PNG works best." },
  share: { title: "Share your lead page", text: "Copy this link or tap Share, then post it on WhatsApp or Facebook to get your first lead." },
  call: { title: "Call them now", text: "Tap Call. When you come back, tell us how it went." },
};

/** Waits for the element (pages render after their data loads), then
 *  spotlights it. Gives up quietly after a few seconds. */
export function spotlight(key: FocusKey): () => void {
  let cancelled = false;
  let d: ReturnType<typeof driver> | null = null;
  const started = Date.now();

  const tryStart = () => {
    if (cancelled) return;
    const el = document.querySelector<HTMLElement>(`[data-focus="${key}"]`);
    if (!el) {
      if (Date.now() - started < 6000) setTimeout(tryStart, 150);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const hint = HINTS[key];
    d = driver({
      popoverClass: "ek-tour",
      showProgress: false,
      allowClose: true,
      overlayOpacity: 0.55,
      stagePadding: 8,
      stageRadius: 6,
      popoverOffset: 12,
      steps: [{ element: el, popover: { title: hint.title, description: hint.text, showButtons: ["next"], nextBtnText: "Got it" } }],
    });
    // Using the element itself (e.g. opening the file picker) is the goal:
    // get out of the way as soon as they do.
    el.addEventListener("click", () => d?.destroy(), { once: true, capture: true });
    setTimeout(() => d?.drive(), 350); // after the smooth scroll settles
  };
  tryStart();

  return () => {
    cancelled = true;
    d?.destroy();
  };
}

/** Runs the spotlight for ?focus=<key> on the current page, then removes the
 *  parameter so a refresh doesn't repeat it. */
export function useFocusFromUrl() {
  const location = useLocation();
  const navigate = useNavigate();
  const stopRef = useRef<(() => void) | null>(null);

  // Only leaving the page cancels it. (Removing ?focus from the URL re-runs
  // the effect below, and must not.)
  useEffect(() => () => stopRef.current?.(), []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const key = params.get("focus") as FocusKey | null;
    if (!key || !(key in HINTS)) return;
    stopRef.current?.();
    stopRef.current = spotlight(key);
    params.delete("focus");
    const rest = params.toString();
    navigate({ pathname: location.pathname, search: rest ? `?${rest}` : "" }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
}
