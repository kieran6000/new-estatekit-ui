import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as questionsApi from "../api/customQuestions";
import type { QuestionType } from "../types";

const KEY = (pageId: string) => ["customQuestions", pageId] as const;

export function useCustomQuestions(pageId: string) {
  return useQuery({
    queryKey: KEY(pageId),
    queryFn: () => questionsApi.listCustomQuestions(pageId),
  });
}

export function useAddCustomQuestion(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, type, options }: { label: string; type: QuestionType; options?: string[] }) =>
      questionsApi.addCustomQuestion(pageId, label, type, options),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(pageId) }),
  });
}

export function useUpdateCustomQuestion(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Parameters<typeof questionsApi.updateCustomQuestion>[1] }) =>
      questionsApi.updateCustomQuestion(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(pageId) }),
  });
}

export function useRemoveCustomQuestion(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => questionsApi.removeCustomQuestion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(pageId) }),
  });
}

export function useMoveCustomQuestion(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) =>
      questionsApi.moveCustomQuestion(id, direction),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(pageId) }),
  });
}
