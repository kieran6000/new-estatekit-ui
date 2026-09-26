// The confirmation email's main text (seller leads). The standard is the same
// for every agent; an operator can give one agent their own wording
// (agent_profiles.lead_email_body), which applies from the next lead on.
//
// KEEP IN STEP with STANDARD_SELLER_BODY and fillLeadEmail in
// supabase/functions/send-lead-confirmation/index.ts, which is what sends it.
// Paragraphs are separated by a blank line.

export const STANDARD_LEAD_EMAIL_BODY = [
  "Thanks for requesting a free home evaluation for {address}.",
  "I'm having a look at what's sold near you recently.",
  "I'll be in touch shortly to go through what your home could be worth, and whether I have buyers looking in the area.",
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
