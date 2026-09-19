export type Stage =
  | "New Lead"
  | "No Answer"
  | "Contacted"
  | "Booked"
  | "Mandate Signed"
  | "Viewing Booked"
  | "Offer Made"
  | "Bought"
  | "Lost"
  | "Invalid Number";

/** The two built-in pipeline shapes. A pipeline's stage list is always one of
 * these two presets — there is no custom-stage editor. */
export type PipelineKind = "seller" | "buyer";

export const PIPELINE_STAGES: Record<PipelineKind, Stage[]> = {
  seller: ["New Lead", "No Answer", "Contacted", "Booked", "Mandate Signed", "Lost", "Invalid Number"],
  buyer: ["New Lead", "No Answer", "Contacted", "Viewing Booked", "Offer Made", "Bought", "Lost", "Invalid Number"],
};

export const PIPELINE_KIND_LABEL: Record<PipelineKind, string> = { seller: "Seller", buyer: "Buyer" };

/** A named pipeline instance. `kind` fixes its stage list — adding a pipeline
 * only ever means picking a preset + a name, never authoring stages. */
export interface Pipeline {
  id: string;
  name: string;
  kind: PipelineKind;
  sheet_url: string | null;
}

export const DEAD_STAGES: Stage[] = ["Lost", "Invalid Number"];
export const PARKED_STAGES: Stage[] = ["Booked", "Mandate Signed", "Viewing Booked", "Offer Made", "Bought"];

export interface FormAnswer {
  q: string;
  a: string;
}

export interface LeadRow {
  id: string;
  agent_id: string;
  pipeline_id: string;
  /** Which LeadPage's form this came through — null for hand-seeded/manual leads. */
  source_page_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  stage: Stage;
  next_label: string;
  reminder_at: string | null;
  due: boolean;
  form_answers: FormAnswer[];
  note: string;
  commission: number | null;
  created_at: string;
  updated_at: string;
  /** Archived leads are kept but hidden from the working list. */
  archived?: boolean;
  /** Facebook ad this lead came from, resolved lazily from fb_lead_id. */
  fb_ad_id?: string | null;
  /** Ad/traffic parameters captured on the landing page at first visit
   *  (utm_*, fbclid, Meta's {{ad.id}} macros). Empty for leads with no
   *  captured source — see lib/adAttribution.ts. */
  attribution?: Record<string, string> | null;
}

export interface OverviewDailyRow {
  id: string;
  agent_id: string;
  date: string;
  spend: number;
  leads: number;
  leads_reached: number;
  appts: number;
  appts_held: number;
  mandates: number;
  commission_expected: number;
  commission_earned: number;
}

export interface CallQuestionRow {
  id: string;
  agent_id: string;
  question: string;
  created_at: string;
}

export interface SupportTicketRow {
  id: string;
  agent_id: string;
  type: string;
  priority: string;
  message: string;
  emailed: boolean;
  created_at: string;
}

export interface AgentProfileRow {
  agent_id: string;
  display_name: string | null;
  whatsapp_number: string | null;
}

export type OutcomeStep = "main" | "booked" | "reminder" | "commission";

export type OutcomeType =
  | "booked"
  | "spoke"
  | "no_answer"
  | "mandate"
  | "lost"
  | "wrong_number";

export interface StageChangeExtra {
  label?: string;
  at?: string | null;
  commission?: number;
}

/** Gates locked course content, custom form questions, and the upgrade nudge. No shared/pooled-lead concept exists — every lead belongs to the agent. */
export type Tier = "free" | "paid";

export const DEFAULT_ACCENT_COLOR = "#1976d2";

/**
 * A lead-capture page. Every page feeds exactly one pipeline — set once at
 * creation and never edited in place (create a new page to change it,
 * mirroring how a Pipeline's stage preset is also fixed at creation). The
 * only fixed, non-editable-structure fields are the final Name → Email →
 * Phone step; every other question (including the address/timeline
 * questions a new page starts with) is a regular, reorderable CustomQuestion
 * — see api/customQuestions.ts. No page builder — the questions are always
 * one-per-step, in the app's fixed visual template.
 */
export interface LeadPage {
  id: string;
  slug: string;
  name: string;
  pipelineId: string;
  /** The owning agent's user id — used to load their sold-listings social proof. */
  agentId: string;
  agentName: string;
  headline: string;
  suburb: string;
  phone: string;
  /** Shown in the page's header/navbar — the visitor never sees profilePhotoDataUrl there. */
  logoDataUrl: string | null;
  /** Shown only on the thank-you screen, next to the calling animation — never in the header. */
  profilePhotoDataUrl: string | null;
  accentColor: string;
  /** Whether the branded headline screen shows before Step 1 — off starts straight at the form. */
  showIntro: boolean;
  /** Wording for the two fixed contact fields — always present, in this
   * fixed order (Name → Email → Phone), and never reordered/removable. */
  nameLabel: string;
  phoneLabel: string;
  /** Whether the contact step asks for an email address. Name + phone are always collected. */
  collectEmail: boolean;
  /** The final step's submit button text (e.g. "Get my free estimate"). */
  ctaLabel: string;
  /** Shown after submit, in place of the form. `{name}` is replaced with what they typed. */
  thankYouHeadline: string;
  thankYouSubtext: string;
  fbPixelId: string;
  sourceType: "website" | "fb_form";
  fbFormId: string | null;
  fbFormName: string | null;
}

/** "address" behaves like short_text but keeps the location-pin icon and an
 * example caption (CustomQuestion.helperText) — the only visual difference
 * from a plain short_text question. */
export type QuestionType = "short_text" | "address" | "multiple_choice" | "yes_no";

export interface CustomQuestion {
  id: string;
  pageId: string;
  label: string;
  type: QuestionType;
  options?: string[];
  /** Choice answers that mark a lead as NOT a good fit. Picking one sends the
   * visitor to a polite "not a fit" screen and does NOT create a lead. */
  disqualifyAnswers?: string[];
  /** Choice answers that still create a lead, but are never reported to
   * Facebook as a conversion — so the pixel stops looking for more like them.
   * The middle ground between carrying on and disqualifyAnswers. */
  lowQualityAnswers?: string[];
  /** Small example/caption text shown under the question — mainly for "address". */
  helperText?: string;
  /** Blocks "Next Step" until answered. Choice-type questions already can't
   * be skipped, since tapping an option is the only way to advance. */
  required: boolean;
  /** True for the address/timeline questions a page starts with — still
   * fully editable/reorderable/removable, just pre-seeded so a brand-new
   * page's form isn't just three contact fields. Adding *more* than the
   * seeded questions is the paid-tier feature; editing/reordering isn't. */
  isDefault: boolean;
  order: number;
}

