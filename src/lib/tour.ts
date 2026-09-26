import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour.css";

// Guided walkthrough for the Leads tab. Runs once per agent (remembered in
// localStorage) and can be replayed from the Leads header (the ? button).
//
// Built for completion rate:
//   - it opens with a welcome card they choose to start, so it never ambushes
//   - only the 4 things they use every day, one short line each
//   - a stray tap on the dark background doesn't kill it (only X / Esc / Skip)
//   - steps whose element isn't on screen (e.g. no leads yet) are dropped
//     up front, so there's never an empty "floating" tip
//   - it ends on an action ("Start calling"), not "Got it"
//   - every step is tracked in PostHog so completion can be measured

// v2: the redesigned tour. A new key means agents who dismissed the old one
// see this once too.
function seenKey(agentId?: string | null): string {
  return `estatekit_tour_leads_v2_${agentId || "me"}`;
}

export function hasSeenLeadsTour(agentId?: string | null): boolean {
  try {
    return localStorage.getItem(seenKey(agentId)) === "1";
  } catch {
    return true; // storage blocked — don't nag
  }
}

/** Fired on window when the tour is finished or closed, so anything showing
 *  "take the tour" (the Launch checklist) can update straight away. */
export const TOUR_SEEN_EVENT = "estatekit:tour-seen";

function markSeen(agentId?: string | null) {
  try {
    localStorage.setItem(seenKey(agentId), "1");
  } catch { /* ignore */ }
  window.dispatchEvent(new Event(TOUR_SEEN_EVENT));
}

type Capture = (event: string, props?: Record<string, unknown>) => void;

interface TourStep {
  id: string;
  /** No element = a centred card (welcome / finish). */
  element?: string;
  icon: string;
  title: string;
  text: string;
}

// Material icon shapes (the same ones MUI uses), since driver.js renders plain
// HTML rather than React.
const ICON = {
  explore: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8m-5.5-2.5 7.51-3.49L17.5 6.5 9.99 9.99zm5.5-6.6c.61 0 1.1.49 1.1 1.1s-.49 1.1-1.1 1.1-1.1-.49-1.1-1.1.49-1.1 1.1-1.1",
  list: "M3 5v14h18V5zm4 2v2H5V7zm-2 6v-2h2v2zm0 2h2v2H5zm14 2H9v-2h10zm0-4H9v-2h10zm0-4H9V7h10z",
  filter: "M10 18h4v-2h-4zM3 6v2h18V6zm3 7h12v-2H6z",
  person: "M12 6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2m0 10c2.7 0 5.8 1.29 6 2H6c.23-.72 3.31-2 6-2m0-12C9.79 4 8 5.79 8 8s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4m0 10c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4",
  call: "M6.54 5c.06.89.21 1.76.45 2.59l-1.2 1.2c-.41-1.2-.67-2.47-.76-3.79zm9.86 12.02c.85.24 1.72.39 2.6.45v1.49c-1.32-.09-2.59-.35-3.8-.75zM7.5 3H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.49c0-.55-.45-1-1-1-1.24 0-2.45-.2-3.57-.57-.1-.04-.21-.05-.31-.05-.26 0-.51.1-.71.29l-2.2 2.2c-2.83-1.45-5.15-3.76-6.59-6.59l2.2-2.2c.28-.28.36-.67.25-1.02C8.7 6.45 8.5 5.25 8.5 4c0-.55-.45-1-1-1",
  done: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8m4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8z",
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Title with a Material icon beside it. driver.js renders titles as HTML. */
function heading(iconPath: string, title: string): string {
  return `<svg class="ek-tour-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPath}"/></svg><span>${title}</span>`;
}

/** Steps are matched by data-tour attributes so markup changes don't silently
 *  break the tour. */
export function startLeadsTour(
  opts: { agentId?: string | null; firstName?: string | null; capture?: Capture; auto?: boolean; onEnd?: () => void } = {},
) {
  const { agentId, capture = () => {}, auto = false, onEnd } = opts;
  const first = (opts.firstName || "").trim().split(/\s+/)[0];

  const all: TourStep[] = [
    {
      id: "welcome",
      icon: ICON.explore,
      title: first ? `Welcome, ${esc(first)}!` : "Welcome to your leads",
      text: "Here's how to turn leads into listings, in 4 quick taps. It takes 30 seconds.",
    },
    {
      id: "pipeline",
      element: "[data-tour='pipeline']",
      icon: ICON.list,
      title: "Your lists",
      text: "Sellers and buyers live in separate lists. Tap here to switch.",
    },
    {
      id: "filters",
      element: "[data-tour='filters']",
      icon: ICON.filter,
      title: "Who to call next",
      text: "Tap a filter to see just the new leads, or the ones waiting on a callback.",
    },
    {
      id: "lead",
      element: "[data-tour='lead-row']",
      icon: ICON.person,
      title: "Everything about a lead",
      text: "Tap a name to see their number, their property and what they answered on your form.",
    },
    {
      id: "call",
      element: "[data-tour='call']",
      icon: ICON.call,
      title: "Call in one tap",
      text: "Tap <b>Call</b>. When you hang up and come back, pick what happened and the lead moves forward by itself.",
    },
    {
      id: "done",
      icon: ICON.done,
      title: "You're ready",
      text: "New leads also arrive on your WhatsApp. The fastest callers win the listing, so aim to call within 5 minutes.<br/><span class='ek-tour-hint'>Replay this any time with the <b>?</b> button.</span>",
    },
  ];

  // Drop steps whose element isn't on screen right now.
  const steps = all.filter((s) => !s.element || document.querySelector(s.element));
  const total = steps.length;
  let reached = 0;
  let finished = false;

  const driveSteps: DriveStep[] = steps.map((s, i) => ({
    element: s.element,
    popover: {
      title: heading(s.icon, s.title),
      description: s.text,
      side: s.element ? "bottom" : undefined,
      align: "center",
      showButtons: i === 0 ? ["next", "close"] : ["next", "previous", "close"],
      nextBtnText: i === 0 ? "Show me" : i === total - 1 ? "Start calling" : "Next",
      prevBtnText: "Back",
      onPopoverRender: (popover) => {
        // Step 0 gets a quiet "Skip" instead of a Back button.
        if (i === 0) {
          const skip = document.createElement("button");
          skip.className = "ek-tour-skip";
          skip.textContent = "Skip";
          skip.onclick = () => d.destroy();
          popover.footerButtons.prepend(skip);
        }
      },
    },
  }));

  const d = driver({
    popoverClass: "ek-tour",
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    allowClose: true,
    // A mis-tap on the backdrop (easy on a phone) used to end the tour for
    // good. Now only X, Esc or Skip close it.
    overlayClickBehavior: () => {},
    overlayOpacity: 0.55,
    smoothScroll: true,
    stagePadding: 6,
    stageRadius: 10,
    popoverOffset: 12,
    steps: driveSteps,
    onHighlighted: (_el, step) => {
      const i = driveSteps.indexOf(step);
      reached = Math.max(reached, i);
      capture("tour_step_viewed", { tour: "leads", step: steps[i]?.id, index: i + 1, total, auto });
      if (i === total - 1) finished = true;
    },
    onDestroyed: () => {
      markSeen(agentId);
      if (finished) capture("tour_completed", { tour: "leads", total, auto });
      else capture("tour_dismissed", { tour: "leads", at_step: steps[reached]?.id, index: reached + 1, total, auto });
      onEnd?.();
    },
  });

  capture("tour_started", { tour: "leads", total, auto });
  d.drive();
}
