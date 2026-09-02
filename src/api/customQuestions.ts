import { getStore, setStore, uid } from "./_store";
import type { CustomQuestion, PipelineKind } from "../types";
import { LEAD_FORM_TEMPLATE } from "../lib/leadFormTemplate";

const KEY = "custom_questions";

/** "page-seller" (the app's seeded starter page) gets the same two default
 * questions a freshly-created seller page would — see seedDefaultQuestions. */
function seedAll(): CustomQuestion[] {
  return defaultQuestionRows("page-seller", "seller", "q-seller-");
}

function defaultQuestionRows(pageId: string, kind: PipelineKind, idPrefix: string): CustomQuestion[] {
  const t = LEAD_FORM_TEMPLATE[kind];
  return [
    {
      id: idPrefix + "address",
      pageId,
      label: t.addressLabel,
      type: "address",
      helperText: t.addressHelperText,
      required: true,
      isDefault: true,
      order: 0,
    },
    {
      id: idPrefix + "second",
      pageId,
      label: t.secondQuestionLabel,
      type: "multiple_choice",
      options: [...t.secondOptions],
      required: true,
      isDefault: true,
      order: 1,
    },
  ];
}

async function listAll(): Promise<CustomQuestion[]> {
  return getStore<CustomQuestion[]>(KEY, seedAll());
}

// TODO: connect backend — replace with a real `select * from custom_questions where page_id = ... order by order` call.
export async function listCustomQuestions(pageId: string): Promise<CustomQuestion[]> {
  return (await listAll()).filter((q) => q.pageId === pageId).sort((a, b) => a.order - b.order);
}

/** Gives a brand-new page its starting address + timeline/budget questions —
 * called once, right after a page is created. From then on they're just
 * regular rows: fully editable, reorderable, and removable. */
export async function seedDefaultQuestions(pageId: string, kind: PipelineKind): Promise<void> {
  const all = await listAll();
  setStore(KEY, [...all, ...defaultQuestionRows(pageId, kind, `${pageId}-`)]);
}

export interface NewCustomQuestion {
  label: string;
  type: CustomQuestion["type"];
  options?: string[];
  helperText?: string;
  required: boolean;
}

// TODO: connect backend — replace with a real insert.
export async function addCustomQuestion(pageId: string, data: NewCustomQuestion): Promise<void> {
  const all = await listAll();
  const order = all.filter((q) => q.pageId === pageId).length;
  const row: CustomQuestion = { id: uid(), pageId, order, isDefault: false, ...data };
  setStore(KEY, [...all, row]);
}

// TODO: connect backend — replace with a real update.
export async function updateCustomQuestion(
  id: string,
  patch: Partial<Pick<CustomQuestion, "label" | "type" | "options" | "helperText" | "required">>,
): Promise<void> {
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
