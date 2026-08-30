import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as questionsApi from "../api/customQuestions";
import type { QuestionType } from "../types";

const KEY = ["customQuestions"] as const;

export function useCustomQuestions() {
  return useQuery({
    queryKey: KEY,
    queryFn: questionsApi.listCustomQuestions,
  });
}

export function useAddCustomQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, type, options }: { label: string; type: QuestionType; options?: string[] }) =>
      questionsApi.addCustomQuestion(label, type, options),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateCustomQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Parameters<typeof questionsApi.updateCustomQuestion>[1] }) =>
      questionsApi.updateCustomQuestion(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveCustomQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => questionsApi.removeCustomQuestion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMoveCustomQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) =>
      questionsApi.moveCustomQuestion(id, direction),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
