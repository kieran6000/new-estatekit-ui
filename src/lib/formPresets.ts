import { supabase } from "../api/_client";
import type { FormPresetKey, LeadPage } from "../types";

// Seller "form types": the standard forms every seller client runs.
// Based on the Media Buyer SOP (Super Low / Low / Mid Evaluation), named like
// Meta's Instant Form types (More volume / Higher intent) with Balanced in
// between. More questions = fewer but more serious leads. Seller pages only.
//
// These are the productised standard. To change one, bump
// FORM_PRESET_VERSION: pages keep the version they were built on and are only
// moved to a new one deliberately ("Update" on the form), never silently.
// Keep the answer wording identical to the Facebook instant form template in
// ESTATEKIT-SYSTEM-REFERENCE.md, so every client's answers report as one.

export const FORM_PRESET_VERSION = 1;

interface PresetQuestion {
  label: string;
  type: "address" | "multiple_choice";
  options?: string[];
  helperText?: string;
  validation?: "street_number";
  /** Picking one of these goes to the end page; no lead is saved. */
  disqualify?: string[];
  /** Saved as a lead, but not counted as a good one (not reported to Facebook). */
  lowQuality?: string[];
}

export interface FormPreset {
  key: FormPresetKey;
  name: string;
  tagline: string;
  bestFor: string;
  collectEmail: boolean;
  questions: PresetQuestion[];
}

// The standard answers. Shared so the same answer is always spelled the same.
const TIMELINE = ["As soon as possible", "1 – 3 months", "3 – 6 months", "6 – 12 months", "Not sure yet"];
const WEAK_TIMELINE = ["6 – 12 months", "Not sure yet"];
const REASONS = ["Relocating", "Emigrating", "Downsizing", "Upgrading", "Retirement", "Inherited property", "Financial reasons"];
const BROWSING = "I just want to know what it's worth for now";

const ADDRESS: PresetQuestion = {
  label: "What's your property address?",
  type: "address",
  helperText: "e.g. 14 Loop Street, Centurion",
};

const TIMELINE_Q = "If your FREE home evaluation is good, how soon will you sell?";

const LISTED: PresetQuestion = {
  label: "Is your home currently listed with an estate agent?",
  type: "multiple_choice",
  options: ["No", "Yes"],
  disqualify: ["Yes"],
};

export const FORM_PRESETS: FormPreset[] = [
  {
    // Media Buyer SOP: Super Low Eval
    key: "most_leads",
    name: "More volume",
    tagline: "Just their address and contact details. The most leads, but more people who are only curious.",
    bestFor: "getting started, or when leads have slowed down",
    collectEmail: false,
    questions: [ADDRESS],
  },
  {
    // Media Buyer SOP: Low Eval
    key: "balanced",
    name: "Balanced",
    tagline: "Also asks when they plan to sell, and turns away homes already listed with an agent.",
    bestFor: "most agents",
    collectEmail: true,
    questions: [
      ADDRESS,
      { label: TIMELINE_Q, type: "multiple_choice", options: TIMELINE, lowQuality: WEAK_TIMELINE },
      LISTED,
    ],
  },
  {
    // Media Buyer SOP: Mid Eval
    key: "best_quality",
    name: "Higher intent",
    tagline: "Also asks why they're selling and needs their full address. Fewer leads, but more serious sellers.",
    bestFor: "when you get lots of leads who never list",
    collectEmail: true,
    questions: [
      { ...ADDRESS, validation: "street_number" },
      {
        label: TIMELINE_Q,
        type: "multiple_choice",
        options: [...TIMELINE, "Not planning to sell"],
        disqualify: ["Not planning to sell"],
        lowQuality: WEAK_TIMELINE,
      },
      {
        label: "What's the main reason you're thinking about selling?",
        type: "multiple_choice",
        options: [...REASONS, BROWSING],
        disqualify: [BROWSING],
      },
      LISTED,
    ],
  },
];

export const presetByKey = (k: FormPresetKey | null | undefined) => FORM_PRESETS.find((p) => p.key === k) ?? null;

/** The intro headline names the area: under Facebook's housing rules the
 *  words on the page are the only targeting left, so a generic headline
 *  wastes it. */
export function presetHeadline(area: string): string {
  const a = area.trim();
  return a ? `What's your ${a} home worth today? Get a free evaluation` : "What's your home worth today? Get a free evaluation";
}

/** The standard wording shared by every form type (the headline is added
 *  per page, from its area). */
const COPY_ROW = {
  show_intro: true,
  name_label: "Where should we send your FREE home evaluation?",
  cta_label: "Claim FREE Home Evaluation",
  thank_you_headline: "Almost done, {name}!",
  thank_you_subtext:
    "I'm preparing your free home evaluation. My assistant will give you a quick call to confirm a few details. Small things can shift your value by R20,000 to R120,000+.",
  dq_headline: "Thanks for your interest!",
  dq_text:
    "It sounds like now isn't the right time to sell, and that's completely fine. Whenever you're ready, we'd love to help you get the best price for your home.",
  // No button: we don't send people to anyone else's site.
  dq_cta_label: "",
  dq_cta_url: "",
};

/** The first part of an area like "Centurion, Pretoria East" — for the headline. */
function firstArea(area: string | null | undefined): string {
  return (area || "").split(/[,/•|;]/)[0].trim();
}

/** Replaces a page's questions with the form type's and tags the page with
 *  the type and version. With withCopy, also sets the standard wording, with
 *  an intro headline naming the page's suburb (or the agent's area).
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
    validation: q.validation ?? null,
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

  const patch: Record<string, unknown> = { preset: key, preset_version: FORM_PRESET_VERSION, collect_email: preset.collectEmail };
  if (withCopy) {
    // The page's own suburb, else the first area on the agent's profile.
    const { data: pg } = await supabase.from("lead_pages").select("suburb").eq("id", page.id).maybeSingle();
    let area = firstArea(pg?.suburb);
    if (!area) {
      const { data: prof } = await supabase.from("agent_profiles").select("area").eq("agent_id", page.agentId).maybeSingle();
      area = firstArea(prof?.area);
      if (area) patch.suburb = area;
    }
    Object.assign(patch, COPY_ROW, { headline: presetHeadline(area) });
  }

  const { error: pageErr } = await supabase.from("lead_pages").update(patch).eq("id", page.id);
  if (pageErr) throw new Error(pageErr.message);
}
