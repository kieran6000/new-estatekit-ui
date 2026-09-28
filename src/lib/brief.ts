// A client's brief: the same data points for every client, wherever the
// answer came from.
//
//   signup   the sign-up page (/start), for clients who joined through it
//   form     the older onboarding form (client_dossiers.data.onboarding,
//            under its old question names, the "aliases" below)
//   call     answered on the onboarding call and typed in on the client page
//            (saved to the dossier under the standard label)
//   profile  their account details, as a last resort
//
// An answer saved under the standard label always wins, so a wrong sign-up
// answer can be corrected on the client page.
// KEEP IN STEP with BRIEF_FIELDS / buildBrief in
// supabase/functions/internal-client-feed/index.ts.

export type BriefKey =
  | "wants" | "city" | "suburbs" | "budget" | "agency"
  | "deals" | "price" | "commission" | "goal" | "callback" | "offer" | "team" | "website" | "address";

export type BriefPart = "signup" | "call";

export interface BriefField {
  key: BriefKey;
  label: string;
  /** Question names the older onboarding form used for this. */
  aliases: string[];
  /** Asked on the sign-up page, or on the onboarding call. */
  part: BriefPart;
  placeholder?: string;
}

export const BRIEF_FIELDS: BriefField[] = [
  { key: "wants", label: "Wants more", aliases: ["Campaign type", "Lead focus"], part: "signup", placeholder: "e.g. Sellers, or Sellers and Buyers (60/40)" },
  { key: "city", label: "City or town", aliases: ["City / town"], part: "signup" },
  { key: "suburbs", label: "Top suburbs", aliases: ["Top areas to target"], part: "signup", placeholder: "Separate with commas" },
  { key: "budget", label: "Monthly ad budget", aliases: [], part: "signup", placeholder: "e.g. R2 000 – R5 000" },
  { key: "agency", label: "Agency", aliases: ["Brokerage / agency"], part: "signup" },
  { key: "deals", label: "Deals closed in the last 6 months", aliases: ["Deals closed in past 6 months"], part: "call" },
  { key: "price", label: "Average home price", aliases: ["Average price range"], part: "call", placeholder: "e.g. R1.5m – R3m" },
  { key: "commission", label: "Commission %", aliases: [], part: "call" },
  { key: "goal", label: "Goal for the first 3 months", aliases: [], part: "call", placeholder: "e.g. 3 listings" },
  { key: "callback", label: "When they can call leads back", aliases: [], part: "call", placeholder: "e.g. within the hour, not Sundays" },
  { key: "offer", label: "Special offer", aliases: ["Special offer to leverage"], part: "call", placeholder: "e.g. show house, pays the electrical certificate" },
  { key: "team", label: "Team", aliases: ["Team type"], part: "call" },
  { key: "website", label: "Website", aliases: [], part: "call" },
  { key: "address", label: "Business address", aliases: [], part: "call" },
];

/** Every question name that belongs to the brief (standard labels and old names). */
export const BRIEF_QUESTIONS = new Set(BRIEF_FIELDS.flatMap((f) => [f.label, ...f.aliases]));

export type BriefSource = "call" | "signup" | "form" | "profile";

export interface BriefSignup {
  wants: string[];
  city: string;
  suburbs: string;
  budget: string;
  agency: string;
}

// Answers like "No", "Na" or "None" to "Special offer" mean there isn't one.
const blank = (s: string | null | undefined) => !s || /^(n\/?a|no|none|-)$/i.test(s.trim());

export function buildBrief(input: {
  signup: BriefSignup | null;
  onboarding: { q: string; a: string }[];
  targetAreas: string[];
  company: string | null | undefined;
}): Record<BriefKey, { value: string; source: BriefSource } | null> {
  const answer = (q: string) => input.onboarding.find((x) => x.q === q && !blank(x.a))?.a.trim() || "";
  const s = input.signup;
  const fromSignup: Partial<Record<BriefKey, string>> = s
    ? { wants: s.wants.join(" and "), city: s.city, suburbs: s.suburbs, budget: s.budget, agency: s.agency }
    : {};
  const out = {} as Record<BriefKey, { value: string; source: BriefSource } | null>;
  for (const f of BRIEF_FIELDS) {
    const saved = answer(f.label);
    const signed = (fromSignup[f.key] || "").trim();
    const old = f.aliases.map(answer).find(Boolean) || "";
    const fallback =
      f.key === "suburbs" ? input.targetAreas.join(", ") : f.key === "agency" ? (input.company || "").trim() : "";
    out[f.key] = saved
      ? { value: saved, source: "call" }
      : signed
        ? { value: signed, source: "signup" }
        : old
          ? { value: old, source: "form" }
          : fallback
            ? { value: fallback, source: "profile" }
            : null;
  }
  return out;
}
