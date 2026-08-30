import { getStore, setStore, uid } from "./_store";
import type { LeadRow, Stage } from "../types";

const KEY = "leads";
const AGENT_ID = "mock-agent-1";

function seedLeads(): LeadRow[] {
  const now = new Date().toISOString();
  return [
    {
      id: uid(),
      agent_id: AGENT_ID,
      name: "Riana Carstens",
      phone: "082 633 3522",
      email: "riana.c@example.com",
      stage: "New Lead",
      next_label: "Just came in",
      reminder_at: null,
      due: true,
      form_answers: [
        { q: "Enter your full property address", a: "14 Loop St, Cape Town" },
        { q: "When are you looking to sell?", a: "Within 3 months" },
      ],
      note: "",
      commission: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: uid(),
      agent_id: AGENT_ID,
      name: "Sipho Nkosi",
      phone: "071 442 9981",
      email: "sipho.n@example.com",
      stage: "Contacted",
      next_label: "Follow up in 2 days",
      reminder_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      due: false,
      form_answers: [{ q: "Enter your full property address", a: "8 Kloof Rd, Sea Point" }],
      note: "",
      commission: null,
      created_at: now,
      updated_at: now,
    },
  ];
}

// TODO: connect backend — replace with a real `select * from leads` call.
export async function listLeads(): Promise<LeadRow[]> {
  return getStore<LeadRow[]>(KEY, seedLeads());
}

// TODO: connect backend — replace with a real `update leads set ...` call.
export async function updateLead(id: string, patch: Partial<LeadRow>): Promise<void> {
  const leads = await listLeads();
  setStore(
    KEY,
    leads.map((l) => (l.id === id ? { ...l, ...patch, updated_at: new Date().toISOString() } : l)),
  );
}

// TODO: connect backend — replace with a real insert from the lead-page form submit.
export async function createLeadFromSubmission(name: string, phone: string, address: string): Promise<LeadRow> {
  const leads = await listLeads();
  const now = new Date().toISOString();
  const lead: LeadRow = {
    id: uid(),
    agent_id: AGENT_ID,
    name,
    phone,
    email: null,
    stage: "New Lead" as Stage,
    next_label: "Just came in",
    reminder_at: null,
    due: true,
    form_answers: [{ q: "Property address", a: address }],
    note: "",
    commission: null,
    created_at: now,
    updated_at: now,
  };
  setStore(KEY, [lead, ...leads]);
  return lead;
}
