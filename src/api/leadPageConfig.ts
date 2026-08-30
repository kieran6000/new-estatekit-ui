import { getStore, setStore } from "./_store";
import type { LeadPageConfig } from "../types";
import { createLeadFromSubmission } from "./leads";

const KEY = "lead_page_config";

function seedConfig(): LeadPageConfig {
  return {
    agentName: "Kegan Smith",
    headline: "Find out what your home is worth — free, no obligation.",
    suburb: "Cape Town",
    phone: "082 000 0000",
    logoDataUrl: null,
    accent: "blue",
  };
}

// TODO: connect backend — replace with a real per-agent config lookup.
export async function getLeadPageConfig(): Promise<LeadPageConfig> {
  return getStore<LeadPageConfig>(KEY, seedConfig());
}

// TODO: connect backend — replace with a real config upsert.
export async function saveLeadPageConfig(config: LeadPageConfig): Promise<void> {
  setStore(KEY, config);
}

export function slugFor(agentName: string): string {
  const slug = agentName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return (slug || "agent") + ".estatekit.co";
}

// TODO: connect backend — the seller-facing form's submit currently only
// simulates a network call for the mockup preview; wire to real lead
// ingestion when the public landing page ships.
export async function submitMockLead(name: string, phone: string, address: string) {
  return createLeadFromSubmission(name, phone, address);
}
