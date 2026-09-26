import { supabase } from "../api/_client";
import type { FormPresetKey, LeadPage } from "../types";

// Seller form presets by friction level, from the Media Buyer SOP (Super Low /
// Low / Mid Evaluation). More questions = fewer but more serious leads. Named
// by outcome so agents don't need the jargon. Only for seller pages: the SOP
// is all about home evaluations.

interface PresetQuestion {
  label: string;
  type: "address" | "multiple_choice";
  options?: string[];
  helperText?: string;
  /** Picking one of these ends the form politely; no lead is created. */
  disqualify?: string[];
  /** Kept as a lead, but not reported to Facebook as a conversion. */
  lowQuality?: string[];
}

export interface FormPreset {
  key: FormPresetKey;
  name: string;
  /** SOP name, for the media buyer. */
  sop: string;
  tagline: string;
  bestFor: string;
  collectEmail: boolean;
  questions: PresetQuestion[];
}

const ADDRESS: PresetQuestion = {
  label: "Enter your FULL property address to calculate your home value",
  type: "address",
  helperText: "e.g. 14 Loop Street, Centurion",
};

export const FORM_PRESETS: FormPreset[] = [
  {
    key: "most_leads",
    name: "Most leads",
    sop: "Super Low Eval",
    tagline: "Address, then name and number. Cheapest leads, most tyre-kickers.",
    bestFor: "New campaigns, small areas, or when volume has dried up",
    collectEmail: false,
    questions: [ADDRESS],
  },
  {
    key: "balanced",
    name: "Balanced",
    sop: "Low Eval",
    tagline: "Adds when they'd sell. Unsure sellers still come through but aren't counted as conversions.",
    bestFor: "Most agents, most of the time",
    collectEmail: true,
    questions: [
      ADDRESS,
      {
        label: "If your FREE home evaluation is good, how soon will you sell?",
        type: "multiple_choice",
        options: ["Immediately", "1 – 3 months", "3 – 6 months", "6 – 12 months", "Not sure yet"],
        lowQuality: ["6 – 12 months", "Not sure yet"],
      },
    ],
  },
  {
    key: "best_quality",
    name: "Best quality",
    sop: "Mid Eval",
    tagline: "Adds timeline and reason. People not selling or just curious go to the end page instead.",
    bestFor: "Agents drowning in valuation-seekers who don't list",
    collectEmail: true,
    questions: [
      ADDRESS,
      {
        label: "If your FREE home evaluation is good, how soon will you sell?",
        type: "multiple_choice",
        options: ["As soon as possible", "1 – 3 months", "3 – 6 months", "6 – 12 months", "Not sure yet", "Not planning to sell"],
        disqualify: ["Not planning to sell"],
        lowQuality: ["6 – 12 months", "Not sure yet"],
      },
      {
        label: "What's the main reason you're thinking about selling?",
        type: "multiple_choice",
        options: ["Relocating", "Downsizing", "Upgrading", "Inherited property", "Financial reasons", "Just curious"],
        disqualify: ["Just curious"],
      },
    ],
  },
];

export const presetByKey = (k: FormPresetKey | null | undefined) => FORM_PRESETS.find((p) => p.key === k) ?? null;

/** The SOP's page wording, shared by every preset. */
export const PRESET_COPY: Partial<LeadPage> = {
  showIntro: true,
  headline: "Claim Your Realistic Home Evaluation For Free",
  nameLabel: "Where should we send your FREE home evaluation?",
  ctaLabel: "Claim FREE Home Evaluation",
  thankYouHeadline: "Almost done, {name}!",
  thankYouSubtext:
    "I'm preparing your free home evaluation. My assistant will give you a quick call to confirm a few details. Small things can shift your value by R20,000 to R120,000+.",
  dqHeadline: "Get an instant estimate online",
  dqText: "Not ready for a full evaluation yet? No problem. Get a quick online estimate of your home's value right now. When you want the accurate number, we're here.",
  dqCtaLabel: "Get instant estimate",
  dqCtaUrl: "https://instantcma.co.za/",
};

const COPY_ROW = {
  show_intro: PRESET_COPY.showIntro,
  headline: PRESET_COPY.headline,
  name_label: PRESET_COPY.nameLabel,
  cta_label: PRESET_COPY.ctaLabel,
  thank_you_headline: PRESET_COPY.thankYouHeadline,
  thank_you_subtext: PRESET_COPY.thankYouSubtext,
  dq_headline: PRESET_COPY.dqHeadline,
  dq_text: PRESET_COPY.dqText,
  dq_cta_label: PRESET_COPY.dqCtaLabel,
  dq_cta_url: PRESET_COPY.dqCtaUrl,
};

/** Replaces a page's questions with the preset's and tags the page. With
 *  withCopy, also sets the SOP wording (headline, button, thank-you and
 *  "not a fit" screen).
 *
 *  Order matters: the new questions go in first and the old ones are removed
 *  only after that works, so a failure part-way can't leave a live page with
 *  no questions. */
export async function applyFormPreset(page: Pick<LeadPage, "id" | "agentId">, key: FormPresetKey, withCopy: boolean): Promise<void> {
  const preset = presetByKey(key);
  if (!preset) throw new Error("unknown preset");

  const { data: old, error: oldErr } = await supabase.from("custom_questions").select("id").eq("page_id", page.id);
  if (oldErr) throw new Error(oldErr.message);

  const rows = preset.questions.map((q, i) => ({
    page_id: page.id,
    agent_id: page.agentId,
    label: q.label,
    type: q.type,
    options: q.options ?? null,
    helper_text: q.helperText ?? null,
    required: true,
    is_default: false,
    sort_order: i,
    disqualify_answers: q.disqualify ?? [],
    low_quality_answers: q.lowQuality ?? [],
  }));
  const { error: insErr } = await supabase.from("custom_questions").insert(rows);
  if (insErr) throw new Error(insErr.message);

  const oldIds = (old ?? []).map((r) => r.id as string);
  if (oldIds.length) {
    const { error: delErr } = await supabase.from("custom_questions").delete().in("id", oldIds);
    if (delErr) throw new Error(delErr.message);
  }

  const { error: pageErr } = await supabase
    .from("lead_pages")
    .update({ preset: key, collect_email: preset.collectEmail, ...(withCopy ? COPY_ROW : {}) })
    .eq("id", page.id);
  if (pageErr) throw new Error(pageErr.message);
}
