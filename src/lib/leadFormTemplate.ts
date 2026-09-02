import type { PipelineKind } from "../types";

/** The one fixed question that comes right after the first step — the only
 * thing that differs between a Seller-linked and a Buyer-linked page. No
 * builder: which set shows is decided entirely by the page's pipeline kind. */
export interface LeadFormTemplate {
  step1Label: string;
  step1Placeholder: string;
  secondQuestion: string;
  secondOptions: string[];
  defaultHeadline: string;
  defaultCta: string;
  defaultThankYouHeadline: string;
  defaultThankYouSubtext: string;
}

export const LEAD_FORM_TEMPLATE: Record<PipelineKind, LeadFormTemplate> = {
  seller: {
    step1Label: "Property address",
    step1Placeholder: "e.g. 14 Loop St, Cape Town",
    secondQuestion: "When are you looking to sell?",
    secondOptions: ["Within 3 months", "3–6 months", "6–12 months", "Just researching"],
    defaultHeadline: "Find out what your home is worth — free, no obligation.",
    defaultCta: "Get my free estimate",
    defaultThankYouHeadline: "Thanks {name}, your estimate is on its way",
    defaultThankYouSubtext: "We'll be in touch shortly to confirm a few details.",
  },
  buyer: {
    step1Label: "Area you're looking to buy in",
    step1Placeholder: "e.g. Sea Point, Cape Town",
    secondQuestion: "What's your budget?",
    secondOptions: ["Under R1m", "R1m – R2m", "R2m – R3.5m", "R3.5m+"],
    defaultHeadline: "Find your next home — free, no obligation.",
    defaultCta: "Get matched with listings",
    defaultThankYouHeadline: "Thanks {name}, we're on it",
    defaultThankYouSubtext: "We'll be in touch shortly with matching listings.",
  },
};
