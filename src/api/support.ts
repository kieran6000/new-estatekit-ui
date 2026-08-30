import { getStore, setStore, uid } from "./_store";
import type { CallQuestionRow, SupportTicketRow } from "../types";

const QUESTIONS_KEY = "call_questions";
const TICKETS_KEY = "support_tickets";
const AGENT_ID = "mock-agent-1";

// TODO: connect backend — replace with a real insert into call_questions.
export async function sendCallQuestion(question: string): Promise<void> {
  const rows = getStore<CallQuestionRow[]>(QUESTIONS_KEY, []);
  const row: CallQuestionRow = { id: uid(), agent_id: AGENT_ID, question, created_at: new Date().toISOString() };
  setStore(QUESTIONS_KEY, [...rows, row]);
}

// TODO: connect backend — replace with a real edge-function call (send-ticket-email).
export async function sendTicket(args: { type: string; priority: string; message: string }): Promise<{ emailed: boolean }> {
  const rows = getStore<SupportTicketRow[]>(TICKETS_KEY, []);
  const row: SupportTicketRow = { id: uid(), agent_id: AGENT_ID, ...args, emailed: false, created_at: new Date().toISOString() };
  setStore(TICKETS_KEY, [...rows, row]);
  return { emailed: false };
}
