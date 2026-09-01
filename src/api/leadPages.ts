import { getStore, setStore, uid } from "./_store";
import type { FormAnswer, LeadPage, PipelineKind } from "../types";
import { createLeadFromSubmission } from "./leads";

const KEY = "lead_pages";

/** The one fixed headline per pipeline kind a brand-new page starts with —
 * still just a starting point, fully editable afterwards. */
export const DEFAULT_HEADLINE: Record<PipelineKind, string> = {
  seller: "Find out what your home is worth — free, no obligation.",
  buyer: "Find your next home — free, no obligation.",
};

function seedLeadPages(): LeadPage[] {
  return [
    {
      id: "page-seller",
      name: "Seller page",
      pipelineId: "pipeline-seller",
      agentName: "Kegan Smith",
      headline: DEFAULT_HEADLINE.seller,
      suburb: "Cape Town",
      phone: "082 000 0000",
      logoDataUrl: null,
      accentColor: "#1976d2",
    },
  ];
}

// TODO: connect backend — replace with a real `select * from lead_pages` call.
export async function listLeadPages(): Promise<LeadPage[]> {
  return getStore<LeadPage[]>(KEY, seedLeadPages());
}

// TODO: connect backend — replace with a real insert. A page is always
// created against one existing pipeline, picked once and never changed —
// create a new page instead if leads need to go somewhere else.
export async function addLeadPage(name: string, pipelineId: string, kind: PipelineKind): Promise<LeadPage> {
  const rows = await listLeadPages();
  const row: LeadPage = {
    id: uid(),
    name,
    pipelineId,
    agentName: "",
    headline: DEFAULT_HEADLINE[kind],
    suburb: "",
    phone: "",
    logoDataUrl: null,
    accentColor: "#1976d2",
  };
  setStore(KEY, [...rows, row]);
  return row;
}

// TODO: connect backend — replace with a real config upsert. `pipelineId`
// is intentionally not updatable here — see addLeadPage.
export async function updateLeadPage(id: string, patch: Partial<Omit<LeadPage, "id" | "pipelineId">>): Promise<void> {
  const rows = await listLeadPages();
  setStore(
    KEY,
    rows.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  );
}

/** A short, shareable mock public URL — no QR code, just something an agent
 * can paste into a WhatsApp status or a social bio in one tap. */
export function shortLinkFor(page: Pick<LeadPage, "name" | "agentName">): string {
  const slug = (page.agentName || page.name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return "ek.co/p/" + (slug || "agent");
}

// TODO: connect backend — a page's submit currently only simulates a network
// call for the mockup preview; wire to real lead ingestion when the public
// landing page ships. The page's own pipelineId is the entire routing rule —
// no separate "link pipeline" step, no per-submission choice.
export async function submitMockLead(pageId: string, name: string, phone: string, formAnswers: FormAnswer[]) {
  const pages = await listLeadPages();
  const page = pages.find((p) => p.id === pageId);
  if (!page) throw new Error("Lead page not found");
  return createLeadFromSubmission(name, phone, formAnswers, page.pipelineId);
}
