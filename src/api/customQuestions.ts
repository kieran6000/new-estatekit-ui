import { supabase, getActiveAgentId } from "./_client";
import type { CustomQuestion, PipelineKind } from "../types";

interface CqRow {
  id: string;
  page_id: string;
  label: string;
  type: string;
  options: string[] | null;
  disqualify_answers: string[] | null;
  low_quality_answers: string[] | null;
  helper_text: string | null;
  required: boolean;
  is_default: boolean;
  sort_order: number;
}

function rowToQuestion(r: CqRow): CustomQuestion {
  return {
    id: r.id,
    pageId: r.page_id,
    label: r.label,
    type: r.type as CustomQuestion["type"],
    options: r.options ?? undefined,
    disqualifyAnswers: r.disqualify_answers ?? undefined,
    lowQualityAnswers: r.low_quality_answers ?? undefined,
    helperText: r.helper_text ?? undefined,
    required: r.required,
    isDefault: r.is_default,
    order: r.sort_order,
  };
}

export async function listCustomQuestions(
  pageId: string,
): Promise<CustomQuestion[]> {
  const { data, error } = await supabase
    .from("custom_questions")
    .select("*")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as CqRow[]).map(rowToQuestion);
}

export async function listCustomQuestionsPublic(
  pageId: string,
): Promise<CustomQuestion[]> {
  const { data, error } = await supabase
    .from("custom_questions")
    .select("*")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as CqRow[]).map(rowToQuestion);
}

export async function seedDefaultQuestions(
  _pageId: string,
  _kind: PipelineKind,
): Promise<void> {
  return;
}

export interface NewCustomQuestion {
  label: string;
  type: CustomQuestion["type"];
  options?: string[];
  disqualifyAnswers?: string[];
  lowQualityAnswers?: string[];
  helperText?: string;
  required: boolean;
}

export async function addCustomQuestion(
  pageId: string,
  data: NewCustomQuestion,
): Promise<void> {
  const agentId = await getActiveAgentId();
  const { data: maxRow } = await supabase
    .from("custom_questions")
    .select("sort_order")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("custom_questions").insert({
    page_id: pageId,
    agent_id: agentId,
    label: data.label,
    type: data.type,
    options: data.options ?? null,
    disqualify_answers: data.disqualifyAnswers ?? [],
    low_quality_answers: data.lowQualityAnswers ?? [],
    helper_text: data.helperText ?? null,
    required: data.required,
    is_default: false,
    sort_order: nextOrder,
  });
  if (error) throw new Error(error.message);
}

export async function updateCustomQuestion(
  id: string,
  patch: Partial<
    Pick<CustomQuestion, "label" | "type" | "options" | "disqualifyAnswers" | "lowQualityAnswers" | "helperText" | "required">
  >,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.options !== undefined) row.options = patch.options;
  if (patch.disqualifyAnswers !== undefined) row.disqualify_answers = patch.disqualifyAnswers;
  if (patch.lowQualityAnswers !== undefined) row.low_quality_answers = patch.lowQualityAnswers;
  if (patch.helperText !== undefined) row.helper_text = patch.helperText;
  if (patch.required !== undefined) row.required = patch.required;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase
    .from("custom_questions")
    .update(row)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function removeCustomQuestion(id: string): Promise<void> {
  const { error } = await supabase
    .from("custom_questions")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function moveCustomQuestion(
  id: string,
  direction: "up" | "down",
): Promise<void> {
  const { data: current, error: fetchErr } = await supabase
    .from("custom_questions")
    .select("page_id, sort_order")
    .eq("id", id)
    .single();
  if (fetchErr || !current) throw new Error(fetchErr?.message ?? "Not found");

  const targetOrder =
    direction === "up" ? current.sort_order - 1 : current.sort_order + 1;

  const { data: sibling } = await supabase
    .from("custom_questions")
    .select("id")
    .eq("page_id", current.page_id)
    .eq("sort_order", targetOrder)
    .maybeSingle();

  if (!sibling) return;

  await supabase
    .from("custom_questions")
    .update({ sort_order: targetOrder })
    .eq("id", id);
  await supabase
    .from("custom_questions")
    .update({ sort_order: current.sort_order })
    .eq("id", sibling.id);
}
