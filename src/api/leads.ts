import { getStore, setStore, uid } from "./_store";
import type { FormAnswer, LeadRow, Stage } from "../types";

const KEY = "leads";
const AGENT_ID = "mock-agent-1";

function seedLeads(): LeadRow[] {
  const now = new Date().toISOString();
  return [
    {
      id: uid(),
      agent_id: AGENT_ID,
      pipeline_id: "pipeline-seller",
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
      pipeline_id: "pipeline-seller",
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
    {
      id: uid(),
      agent_id: AGENT_ID,
      pipeline_id: "pipeline-buyer",
      name: "Thandiwe Mokoena",
      phone: "083 220 5567",
      email: "thandiwe.m@example.com",
      stage: "New Lead",
      next_label: "Just came in",
      reminder_at: null,
      due: true,
      form_answers: [
        { q: "What area are you looking to buy in?", a: "Sea Point / Green Point" },
        { q: "Budget", a: "R2.5m – R3.5m" },
      ],
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

// TODO: connect backend — replace with a real insert from a lead-page form submit.
export async function createLeadFromSubmission(name: string, phone: string, formAnswers: FormAnswer[], pipelineId: string): Promise<LeadRow> {
  const leads = await listLeads();
  const now = new Date().toISOString();
  const lead: LeadRow = {
    id: uid(),
    agent_id: AGENT_ID,
    pipeline_id: pipelineId,
    name,
    phone,
    email: null,
    stage: "New Lead" as Stage,
    next_label: "Just came in",
    reminder_at: null,
    due: true,
    form_answers: formAnswers,
    note: "",
    commission: null,
    created_at: now,
    updated_at: now,
  };
  setStore(KEY, [lead, ...leads]);
  return lead;
}
