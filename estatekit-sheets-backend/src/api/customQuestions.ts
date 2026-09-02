import { callApi } from "./_client";
import type { CustomQuestion, PipelineKind } from "../types";

export async function listCustomQuestions(pageId: string): Promise<CustomQuestion[]> {
  return callApi<CustomQuestion[]>("customQuestions.list", { pageId });
}

// Seeding now happens server-side inside leadPages.add — kept here as a
// no-op export so any existing import doesn't break; safe to delete callers.
export async function seedDefaultQuestions(_pageId: string, _kind: PipelineKind): Promise<void> {
  return;
}

export interface NewCustomQuestion {
  label: string;
  type: CustomQuestion["type"];
  options?: string[];
  helperText?: string;
  required: boolean;
}

export async function addCustomQuestion(pageId: string, data: NewCustomQuestion): Promise<void> {
  await callApi("customQuestions.add", { pageId, data });
}

export async function updateCustomQuestion(
  id: string,
  patch: Partial<Pick<CustomQuestion, "label" | "type" | "options" | "helperText" | "required">>,
): Promise<void> {
  await callApi("customQuestions.update", { id, patch });
}

export async function removeCustomQuestion(id: string): Promise<void> {
  await callApi("customQuestions.remove", { id });
}

export async function moveCustomQuestion(id: string, direction: "up" | "down"): Promise<void> {
  await callApi("customQuestions.move", { id, direction });
}
