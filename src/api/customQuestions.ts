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

  const row: Record<string, unknown> = {
    page_id: pageId,
    agent_id: agentId,
    label: data.label,
    type: data.type,
    options: data.options ?? null,
    disqualify_answers: data.disqualifyAnswers ?? [],
    helper_text: data.helperText ?? null,
    required: data.required,
    is_default: false,
    sort_order: nextOrder,
  };
  // Same guard as updateCustomQuestion: adding a question must not depend on
  // the routing column existing. The column has a default, so omitting it is
  // harmless once the migration lands too.
  if (!lowQualityUnsupported) row.low_quality_answers = data.lowQualityAnswers ?? [];

  const { error } = await supabase.from("custom_questions").insert(row);
  if (!error) return;

  if ("low_quality_answers" in row && isMissingColumnError(error.message)) {
    lowQualityUnsupported = true;
    console.warn("low_quality_answers column not present — adding without it", error.message);
    delete row.low_quality_answers;
    const { error: retryError } = await supabase.from("custom_questions").insert(row);
    if (retryError) throw new Error(retryError.message);
    return;
  }
  throw new Error(error.message);
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

  // low_quality_answers is newer than some deployments of the database. Saving a
  // question is core work and must not fail just because routing hasn't been
  // migrated yet, so a schema complaint retries once without it — the rest of
  // the edit still lands, and routing quietly does nothing until the column
  // exists. Remembered for the session so this costs one failed call, not one
  // per save.
  if (lowQualityUnsupported) delete row.low_quality_answers;

  const { error } = await supabase.from("custom_questions").update(row).eq("id", id);
  if (!error) return;

  if ("low_quality_answers" in row && isMissingColumnError(error.message)) {
    lowQualityUnsupported = true;
    console.warn("low_quality_answers column not present — saving without it", error.message);
    delete row.low_quality_answers;
    const { error: retryError } = await supabase.from("custom_questions").update(row).eq("id", id);
    if (retryError) throw new Error(retryError.message);
    return;
  }
  throw new Error(error.message);
}

/** Set once the database rejects low_quality_answers, so later saves skip it. */
let lowQualityUnsupported = false;

/** PostgREST wording for "that column/table isn't in my schema cache". */
function isMissingColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("schema cache") || m.includes("column") || m.includes("low_quality_answers");
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
