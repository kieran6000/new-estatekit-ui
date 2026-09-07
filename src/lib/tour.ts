import { driver } from "driver.js";
import "driver.js/dist/driver.css";

// Guided walkthrough for the Leads tab. Runs once per agent (remembered in
// localStorage) and can be replayed from the Leads header.

const SEEN_KEY = "estatekit_tour_leads_v1";

export function hasSeenLeadsTour(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked — don't nag
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch { /* ignore */ }
}

/** Steps are matched by data-tour attributes so markup changes don't silently
 *  break the tour — a missing element is simply skipped by driver.js. */
export function startLeadsTour(onDone?: () => void) {
  const d = driver({
    showProgress: true,
    allowClose: true,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Got it",
    onDestroyed: () => {
      markSeen();
      onDone?.();
    },
    steps: [
      {
        element: "[data-tour='pipeline']",
        popover: {
          title: "Your pipelines",
          description:
            "Leads are split into pipelines — Seller and Buyer. Tap here to switch between them.",
        },
      },
      {
        element: "[data-tour='filters']",
        popover: {
          title: "Filter by stage",
          description:
            "Jump straight to the leads you care about — new ones, no answers, or anyone you've already spoken to.",
        },
      },
      {
        element: "[data-tour='lead-row']",
        popover: {
          title: "A lead",
          description:
            "Tap a name to open it. You'll see their phone, address and what they answered on your form.",
        },
      },
      {
        element: "[data-tour='call']",
        popover: {
          title: "Call them",
          description:
            "This dials straight from your phone. When you come back, you'll be asked how the call went — one tap and the lead moves along.",
        },
      },
      {
        element: "[data-tour='sheets']",
        popover: {
          title: "Export to Sheets",
          description:
            "Sends all these leads to a Google Sheet you can share or print.",
        },
      },
      {
        element: "[data-tour='refresh']",
        popover: {
          title: "Check for new leads",
          description:
            "New leads arrive on their own, but tap here any time you want to pull the latest.",
        },
      },
    ],
  });
  d.drive();
}
