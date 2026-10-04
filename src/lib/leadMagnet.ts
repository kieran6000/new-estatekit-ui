// Lead magnets: what a lead gets straight after the form, on the thank-you
// page and in the confirmation email. One per form, set up in a minute:
// pick a preset, change the words if you like, upload the PDF.
//
// Every lead magnet opens through the lead's own link (/plan/<token>), so we
// can see who opened it, and "Lead opens their lead magnet" can start a
// workflow. The plan page shows the personal marketing plan, or sends the
// lead straight on to the PDF.
//
// KEEP IN STEP with: send-lead-confirmation (the email's box),
// public-submit-lead and run-automations/workflows.ts (which kind applies),
// and open_selling_plan (the database side of the link).

export type MagnetKind = "none" | "plan" | "pdf";

export interface Magnet {
  kind: MagnetKind;
  title: string;
  text: string;
  button: string;
  pdfUrl: string | null;
}

export interface MagnetPreset {
  key: string;
  kind: MagnetKind;
  label: string;
  title: string;
  text: string;
  button: string;
  /** The marketing plan is about selling a home. */
  sellersOnly?: boolean;
}

export const MAGNET_PRESETS: MagnetPreset[] = [
  { key: "plan", kind: "plan", label: "Marketing plan (made for each seller)", sellersOnly: true,
    title: "Your marketing plan is ready", text: "How to sell your home without losing money or time. A 2-minute read.", button: "Open my marketing plan" },
  { key: "seller_guide", kind: "pdf", label: "Home seller's guide (PDF)",
    title: "Your home seller's guide", text: "Everything to know before you sell, in one short guide.", button: "Open the guide" },
  { key: "mistakes", kind: "pdf", label: "Selling mistakes to avoid (PDF)",
    title: "The mistakes that cost sellers money", text: "What to avoid when you sell, and what to do instead.", button: "Read it now" },
  { key: "buyer_guide", kind: "pdf", label: "Home buyer's guide (PDF)",
    title: "Your home buyer's guide", text: "The steps to buying, what it costs, and what to have ready.", button: "Open the guide" },
  { key: "pdf", kind: "pdf", label: "Your own PDF", title: "Your free guide", text: "", button: "Open it" },
  { key: "none", kind: "none", label: "Nothing", title: "", text: "", button: "" },
];

export const presetByKey = (key: string) => MAGNET_PRESETS.find((p) => p.key === key) ?? MAGNET_PRESETS[0];

interface PageMagnetFields {
  magnetKind?: MagnetKind | null;
  magnetTitle?: string;
  magnetText?: string;
  magnetButton?: string;
  magnetPdfUrl?: string | null;
}

/** What this form gives. Not set = the marketing plan on seller forms and
 *  nothing on others (how it worked before lead magnets). A PDF lead magnet
 *  without a PDF yet gives nothing. Blank words fall back to the preset's. */
export function resolveMagnet(page: PageMagnetFields, pipelineKind: string | null | undefined): Magnet {
  let kind: MagnetKind = page.magnetKind ?? (pipelineKind === "seller" ? "plan" : "none");
  if (kind === "pdf" && !page.magnetPdfUrl) kind = "none";
  const base = kind === "plan" ? presetByKey("plan") : kind === "pdf" ? presetByKey("pdf") : presetByKey("none");
  return {
    kind,
    title: page.magnetTitle?.trim() || base.title,
    text: page.magnetText?.trim() || base.text,
    button: page.magnetButton?.trim() || base.button,
    pdfUrl: kind === "pdf" ? page.magnetPdfUrl ?? null : null,
  };
}

/** Which preset the saved settings look like, for the picker. */
export function presetKeyOf(page: PageMagnetFields, pipelineKind: string | null | undefined): string {
  const m = resolveMagnet(page, pipelineKind);
  if (page.magnetKind === "pdf") return MAGNET_PRESETS.find((p) => p.kind === "pdf" && p.title === m.title)?.key ?? "pdf";
  return m.kind === "plan" ? "plan" : "none";
}
