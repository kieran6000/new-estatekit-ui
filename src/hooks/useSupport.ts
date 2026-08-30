import { useMutation } from "@tanstack/react-query";
import * as supportApi from "../api/support";

export function useSendCallQuestion() {
  return useMutation({
    mutationFn: async (question: string) => {
      await supportApi.sendCallQuestion(question);
    },
  });
}

export function useSendTicket() {
  return useMutation({
    mutationFn: async (args: { type: string; priority: string; message: string }) => {
      return supportApi.sendTicket(args);
    },
  });
}
