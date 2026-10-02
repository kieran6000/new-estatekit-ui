// Lead tags: labels for EstateKit staff (agents never see them). Shown with
// the LeadTag chip (components/LeadTag.tsx) everywhere, the automation
// builder included, so a tag always looks and reads the same.
//
// Today's only tag is worked out, not stored:
//   "Not tracked"  a lead from an EstateKit lead page that Facebook
//   was never told about, so it doesn't count as a lead in Ads Manager and
//   the ads don't learn from it. Two ways that happens:
//     - the page has no Dataset ID (pixel) set up, or
//     - their answers matched an answer the page is set to "not count"
//       (Forms → the page → a question → bad answers → "Don't count it").
//   Instant-form leads are Facebook's own, so they never get it.

export const NOT_SENT = "Not tracked";

export type NotSentReason = "weak_answers" | "no_dataset";

/** Why Facebook wasn't told about this lead, or null if it was (or it isn't
 *  a lead-page lead). `datasetByPage` maps a lead page id to its Dataset ID;
 *  without it only the answers reason can be worked out. */
export function notSentReason(
  l: { quality?: string | null; source_page_id?: string | null; fb_lead_id?: string | null },
  datasetByPage?: Map<string, string>,
): NotSentReason | null {
  // Instant-form leads are Facebook's own: always counted, never tagged.
  if (l.fb_lead_id || !l.source_page_id) return null;
  if (l.quality === "weak") return "weak_answers";
  if (datasetByPage?.has(l.source_page_id) && !datasetByPage.get(l.source_page_id)) return "no_dataset";
  return null;
}

export function leadTags(l: { quality?: string | null; source_page_id?: string | null; fb_lead_id?: string | null }, datasetByPage?: Map<string, string>): string[] {
  return notSentReason(l, datasetByPage) ? [NOT_SENT] : [];
}

export const REASON_HELP: Record<NotSentReason, string> = {
  weak_answers: "Facebook wasn't told about this lead: one of their answers is set to \"Don't count it\" on the lead page, so the ads don't go looking for more leads like this.",
  no_dataset: "Facebook wasn't told about this lead: the lead page it came from has no Dataset ID, so Facebook never heard about it. Add one under Forms → the page → Facebook tracking.",
};
