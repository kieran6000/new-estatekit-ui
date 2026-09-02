import { callApi } from "./_client";

export async function sendCallQuestion(question: string): Promise<void> {
  await callApi("support.sendCallQuestion", { question });
}

export async function sendTicket(args: { type: string; priority: string; message: string }): Promise<{ emailed: boolean }> {
  return callApi<{ emailed: boolean }>("support.sendTicket", args);
}
