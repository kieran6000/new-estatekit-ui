import { getStore, setStore } from "./_store";
import type { SetupStepRow } from "../types";

const KEY = "setup_steps";
const AGENT_ID = "mock-agent-1";

function seedSteps(): SetupStepRow[] {
  return [
    {
      id: "step-1",
      agent_id: AGENT_ID,
      key: "connect_whatsapp",
      title: "Connect your WhatsApp number",
      sort_order: 1,
      done: true,
      cta_label: null,
      cta_url: null,
      cta_filled: false,
    },
    {
      id: "step-2",
      agent_id: AGENT_ID,
      key: "book_setup_call",
      title: "Book your setup call",
      sort_order: 2,
      done: false,
      cta_label: "Book call",
      cta_url: "https://cal.com",
      cta_filled: true,
    },
    {
      id: "step-3",
      agent_id: AGENT_ID,
      key: "review_ads",
      title: "Review your ad templates",
      sort_order: 3,
      done: false,
      cta_label: "Open templates",
      cta_url: "https://drive.google.com",
      cta_filled: false,
    },
  ];
}

// TODO: connect backend — replace with a real `select * from setup_steps` call.
export async function listSetupSteps(): Promise<SetupStepRow[]> {
  return getStore<SetupStepRow[]>(KEY, seedSteps());
}

// TODO: connect backend — replace with a real `update setup_steps set done = true` call.
export async function markStepDone(id: string): Promise<void> {
  const steps = await listSetupSteps();
  setStore(
    KEY,
    steps.map((s) => (s.id === id ? { ...s, done: true } : s)),
  );
}
