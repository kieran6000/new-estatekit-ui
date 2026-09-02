import type { PipelineKind } from "../types";

/** Seed data only — used once, when a page is created, to pre-populate its
 * two starting questions (address/area + timeline/budget) and its starting
 * copy. After creation everything here is just a starting point: the
 * questions are regular, editable CustomQuestion rows from that point on. */
export interface LeadFormTemplate {
  addressLabel: string;
  addressHelperText: string;
  secondQuestionLabel: string;
  secondOptions: string[];
  defaultHeadline: string;
  defaultCta: string;
  defaultThankYouHeadline: string;
  defaultThankYouSubtext: string;
}

export const LEAD_FORM_TEMPLATE: Record<PipelineKind, LeadFormTemplate> = {
  seller: {
    addressLabel: "Property address",
    addressHelperText: "e.g. 14 Loop St, Cape Town",
    secondQuestionLabel: "When are you looking to sell?",
    secondOptions: ["Within 3 months", "3–6 months", "6–12 months", "Just researching"],
    defaultHeadline: "Find out what your home is worth — free, no obligation.",
    defaultCta: "Get my free estimate",
    defaultThankYouHeadline: "Thanks {name}, your estimate is on its way",
    defaultThankYouSubtext: "We'll be in touch shortly to confirm a few details.",
  },
  buyer: {
    addressLabel: "Area you're looking to buy in",
    addressHelperText: "e.g. Sea Point, Cape Town",
    secondQuestionLabel: "What's your budget?",
    secondOptions: ["Under R1m", "R1m – R2m", "R2m – R3.5m", "R3.5m+"],
    defaultHeadline: "Find your next home — free, no obligation.",
    defaultCta: "Get matched with listings",
    defaultThankYouHeadline: "Thanks {name}, we're on it",
    defaultThankYouSubtext: "We'll be in touch shortly with matching listings.",
  },
};
