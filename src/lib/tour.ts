import { driver } from "driver.js";
import "driver.js/dist/driver.css";

// Guided walkthrough for the Leads tab. Runs once per agent (remembered in
// localStorage) and can be replayed from the Leads header.

// Keyed per agent, so each agent gets the walkthrough once on their own first
// login — rather than one flag shared by whoever used the browser first.
function seenKey(agentId?: string | null): string {
  return `estatekit_tour_leads_v1_${agentId || "me"}`;
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

/** Steps are matched by data-tour attributes so markup changes don't silently
 *  break the tour — a missing element is simply skipped by driver.js. */
export function startLeadsTour(agentId?: string | null, onDone?: () => void) {
  const d = driver({
    showProgress: true,
    allowClose: true,
    // Phones are small — make sure each spot scrolls into view and the
    // highlight box hugs the button so the tip is easy to read.
    smoothScroll: true,
    stagePadding: 6,
    stageRadius: 8,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Got it",
    onDestroyed: () => {
      markSeen(agentId);
      onDone?.();
    },
    // Wording kept short and simple — one idea per line, easy words.
    steps: [
      {
        element: "[data-tour='pipeline']",
        popover: {
          title: "Your lists",
          description: "Your leads are split into lists. Tap here to switch between them.",
        },
      },
      {
        element: "[data-tour='filters']",
        popover: {
          title: "Find leads fast",
          description: "Tap a word to see just those leads — like new ones, or people you already called.",
        },
      },
      {
        element: "[data-tour='lead-row']",
        popover: {
          title: "Open a lead",
          description: "Tap a name to see their number, their home, and what they typed on your form.",
        },
      },
      {
        element: "[data-tour='call']",
        popover: {
          title: "Call them",
          description: "Tap Call to ring them. When you come back, we ask how it went. One tap moves the lead forward.",
        },
      },
      {
        element: "[data-tour='sheets']",
        popover: {
          title: "Save to a sheet",
          description: "This puts all your leads in a Google Sheet. You can share it or print it.",
        },
      },
      {
        element: "[data-tour='refresh']",
        popover: {
          title: "Get new leads",
          description: "New leads come in on their own. Tap here to check for them right now.",
        },
      },
    ],
  });
  d.drive();
}
