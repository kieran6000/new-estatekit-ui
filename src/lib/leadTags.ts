// Lead tags: labels for EstateKit staff (agents never see them). Shown with
// the LeadTag chip (components/LeadTag.tsx) everywhere, the automation
// builder included, so a tag always looks and reads the same.
//
// Today's only tag is worked out, not stored:
//   "Not ready"  a lead-page lead whose answers matched one of the page's
//                low-quality answers (leads.quality = "weak"). These are the
//                leads the page did NOT report to the pixel / Conversions API.

export const TAG_HELP: Record<string, string> = {
  "Not ready":
    "Their form answers matched one of the page's low-quality answers (for example \"Just curious\"). Not reported to the Facebook pixel or Conversions API, so ads don't optimise for leads like this one.",
};

export function leadTags(l: { quality?: string | null }): string[] {
  return l.quality === "weak" ? ["Not ready"] : [];
}
