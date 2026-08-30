export const STAGES = [
  "New Lead",
  "No Answer",
  "Contacted",
  "Booked",
  "Mandate Signed",
  "Lost",
  "Invalid Number",
] as const;

export type Stage = (typeof STAGES)[number];

export const DEAD_STAGES: Stage[] = ["Lost", "Invalid Number"];
export const PARKED_STAGES: Stage[] = ["Booked", "Mandate Signed"];

export interface FormAnswer {
  q: string;
  a: string;
}

export interface LeadRow {
  id: string;
  agent_id: string;
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
}

export interface OverviewDailyRow {
  id: string;
  agent_id: string;
  date: string;
  spend: number;
  leads: number;
  appts: number;
  mandates: number;
  commission: number;
}

export interface SetupStepRow {
  id: string;
  agent_id: string;
  key: string;
  title: string;
  sort_order: number;
  done: boolean;
  cta_label: string | null;
  cta_url: string | null;
  cta_filled: boolean;
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

export const ACCENT_PRESETS = [
  { key: "blue", label: "Blue", value: "#1976d2" },
  { key: "green", label: "Green", value: "#2e7d32" },
  { key: "terracotta", label: "Terracotta", value: "#c05621" },
] as const;

export type AccentKey = (typeof ACCENT_PRESETS)[number]["key"];

export interface LeadPageConfig {
  agentName: string;
  headline: string;
  suburb: string;
  phone: string;
  logoDataUrl: string | null;
  accent: AccentKey;
}

export type QuestionType = "short_text" | "multiple_choice" | "yes_no";

export interface CustomQuestion {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[];
  order: number;
}

export interface CourseLesson {
  id: string;
  title: string;
  youtubeEmbedUrl: string;
}

export interface CourseModule {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  freeTier: boolean;
  lessons: CourseLesson[];
}

export interface CourseModuleWithLock extends CourseModule {
  locked: boolean;
}
