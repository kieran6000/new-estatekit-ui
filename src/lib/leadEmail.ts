// The confirmation email's main text (seller leads). The standard is the same
// for every agent; an operator can give one agent their own wording
// (agent_profiles.lead_email_body), which applies from the next lead on.
//
// KEEP IN STEP with STANDARD_SELLER_BODY and fillLeadEmail in
// supabase/functions/send-lead-confirmation/index.ts, which is what sends it.
// Paragraphs are separated by a blank line. For seller leads the selling-plan
// box is added after the first paragraph (see PLAN_BLOCK).

/** The selling-plan box, shown after the first paragraph for seller leads.
 *  Its own box (not a line in a paragraph) so it isn't lost in the text.
 *  Every point must be true of every plan (one standard marketing plan; only
 *  the timing tip is personal).
 *  The recent-sales point only shows when the agent has sales on record.
 *  KEEP IN STEP with planBlock() in send-lead-confirmation. */
export const PLAN_BLOCK = {
  title: (address: string) => `How to sell ${address || "your home"} without losing money or time`,
  intro: "While you wait, I've made you a short marketing plan. It takes 2 minutes to read.",
  points: [
    "How I'll market your home, and why you pay nothing until it's sold",
    "The documents to have ready, and the ones that can wait",
    "The one thing to do now, for your timing",
  ],
  salesPoint: "Homes I've sold recently",
  link: "Open my marketing plan",
};

export const STANDARD_LEAD_EMAIL_BODY = [
  "Thanks for requesting a free home evaluation for {address}. I'm working on it now.",
  "When your evaluation is ready, I'll be in touch to go through what your home could be worth, and whether I have buyers looking in the area.",
].join("\n\n");

export const LEAD_EMAIL_PLACEHOLDERS = "{name} = their first name, {address} = their property, {agent} = your first name";

/** Splits the text into paragraphs and fills the placeholders. */
export function fillLeadEmail(text: string, v: { name: string; address: string; agent: string }): string[] {
  return (text || STANDARD_LEAD_EMAIL_BODY)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((p) =>
      p
        .replaceAll("{name}", v.name || "there")
        .replaceAll("{address}", v.address || "your home")
        .replaceAll("{agent}", v.agent || "I"),
    );
}
