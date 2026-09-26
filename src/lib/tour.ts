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

function markSeen(agentId?: string | null) {
  try {
    localStorage.setItem(seenKey(agentId), "1");
  } catch { /* ignore */ }
}

type Capture = (event: string, props?: Record<string, unknown>) => void;

interface TourStep {
  id: string;
  /** No element = a centred card (welcome / finish). */
  element?: string;
  emoji: string;
  title: string;
  text: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Title with its icon tile beside it. driver.js renders titles as HTML. */
function heading(emoji: string, title: string): string {
  return `<span class="ek-tour-emoji" aria-hidden="true">${emoji}</span><span>${title}</span>`;
}

/** Steps are matched by data-tour attributes so markup changes don't silently
 *  break the tour. */
export function startLeadsTour(opts: { agentId?: string | null; firstName?: string | null; capture?: Capture; auto?: boolean } = {}) {
  const { agentId, capture = () => {}, auto = false } = opts;
  const first = (opts.firstName || "").trim().split(/\s+/)[0];

  const all: TourStep[] = [
    {
      id: "welcome",
      emoji: "👋",
      title: first ? `Welcome, ${esc(first)}!` : "Welcome to your leads",
      text: "Here's how to turn leads into listings, in 4 quick taps. It takes 30 seconds.",
    },
    {
      id: "pipeline",
      element: "[data-tour='pipeline']",
      emoji: "🗂️",
      title: "Your lists",
      text: "Sellers and buyers live in separate lists. Tap here to switch.",
    },
    {
      id: "filters",
      element: "[data-tour='filters']",
      emoji: "🔎",
      title: "Who to call next",
      text: "Tap a filter to see just the new leads, or the ones waiting on a callback.",
    },
    {
      id: "lead",
      element: "[data-tour='lead-row']",
      emoji: "🏠",
      title: "Everything about a lead",
      text: "Tap a name to see their number, their property and what they answered on your form.",
    },
    {
      id: "call",
      element: "[data-tour='call']",
      emoji: "📞",
      title: "Call in one tap",
      text: "Tap <b>Call</b>. When you hang up and come back, pick what happened and the lead moves forward by itself.",
    },
    {
      id: "done",
      emoji: "🎉",
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
      title: heading(s.emoji, s.title),
      description: s.text,
      side: s.element ? "bottom" : undefined,
      align: "center",
      showButtons: i === 0 ? ["next", "close"] : ["next", "previous", "close"],
      nextBtnText: i === 0 ? "Show me →" : i === total - 1 ? "Start calling" : "Next →",
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
    },
  });

  capture("tour_started", { tour: "leads", total, auto });
  d.drive();
}
