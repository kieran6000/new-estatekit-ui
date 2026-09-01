import { getStore, setStore, uid } from "./_store";
import type { CustomQuestion, QuestionType } from "../types";

const KEY = "custom_questions";

async function listAll(): Promise<CustomQuestion[]> {
  return getStore<CustomQuestion[]>(KEY, []);
}

// TODO: connect backend — replace with a real `select * from custom_questions where page_id = ... order by order` call.
export async function listCustomQuestions(pageId: string): Promise<CustomQuestion[]> {
  return (await listAll()).filter((q) => q.pageId === pageId).sort((a, b) => a.order - b.order);
}

// TODO: connect backend — replace with a real insert.
export async function addCustomQuestion(pageId: string, label: string, type: QuestionType, options?: string[]): Promise<void> {
  const all = await listAll();
  const order = all.filter((q) => q.pageId === pageId).length;
  const row: CustomQuestion = { id: uid(), pageId, label, type, options, order };
  setStore(KEY, [...all, row]);
}

// TODO: connect backend — replace with a real update.
export async function updateCustomQuestion(id: string, patch: Partial<Pick<CustomQuestion, "label" | "type" | "options">>): Promise<void> {
  const all = await listAll();
  setStore(KEY, all.map((q) => (q.id === id ? { ...q, ...patch } : q)));
}

// TODO: connect backend — replace with a real delete.
export async function removeCustomQuestion(id: string): Promise<void> {
  const all = await listAll();
  const row = all.find((q) => q.id === id);
  if (!row) return;
  const others = all.filter((q) => q.pageId !== row.pageId);
  const group = all.filter((q) => q.pageId === row.pageId && q.id !== id).sort((a, b) => a.order - b.order);
  setStore(KEY, [...others, ...renumber(group)]);
}

// TODO: connect backend — replace with a real reorder/update-many call.
export async function moveCustomQuestion(id: string, direction: "up" | "down"): Promise<void> {
  const all = await listAll();
  const row = all.find((q) => q.id === id);
  if (!row) return;
  const others = all.filter((q) => q.pageId !== row.pageId);
  const group = all.filter((q) => q.pageId === row.pageId).sort((a, b) => a.order - b.order);
  const idx = group.findIndex((q) => q.id === id);
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= group.length) return;
  [group[idx], group[swapWith]] = [group[swapWith], group[idx]];
  setStore(KEY, [...others, ...renumber(group)]);
}

/** Reassigns a contiguous 0..n-1 `order` to one page's questions, in the
 * array's current sequence. */
function renumber(group: CustomQuestion[]): CustomQuestion[] {
  return group.map((q, i) => ({ ...q, order: i }));
}
