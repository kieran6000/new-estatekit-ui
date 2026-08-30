import { getStore, setStore, uid } from "./_store";
import type { CustomQuestion, QuestionType } from "../types";

const KEY = "custom_questions";

// TODO: connect backend — replace with a real `select * from custom_questions order by order` call.
export async function listCustomQuestions(): Promise<CustomQuestion[]> {
  return getStore<CustomQuestion[]>(KEY, []).sort((a, b) => a.order - b.order);
}

// TODO: connect backend — replace with a real insert.
export async function addCustomQuestion(label: string, type: QuestionType, options?: string[]): Promise<void> {
  const rows = await listCustomQuestions();
  const row: CustomQuestion = { id: uid(), label, type, options, order: rows.length };
  setStore(KEY, [...rows, row]);
}

// TODO: connect backend — replace with a real update.
export async function updateCustomQuestion(id: string, patch: Partial<Pick<CustomQuestion, "label" | "type" | "options">>): Promise<void> {
  const rows = await listCustomQuestions();
  setStore(KEY, rows.map((q) => (q.id === id ? { ...q, ...patch } : q)));
}

// TODO: connect backend — replace with a real delete.
export async function removeCustomQuestion(id: string): Promise<void> {
  const rows = await listCustomQuestions();
  setStore(
    KEY,
    rows.filter((q) => q.id !== id).map((q, i) => ({ ...q, order: i })),
  );
}

// TODO: connect backend — replace with a real reorder/update-many call.
export async function moveCustomQuestion(id: string, direction: "up" | "down"): Promise<void> {
  const rows = await listCustomQuestions();
  const idx = rows.findIndex((q) => q.id === id);
  if (idx < 0) return;
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= rows.length) return;
  const next = [...rows];
  [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
  setStore(
    KEY,
    next.map((q, i) => ({ ...q, order: i })),
  );
}
