import { supabase, getCurrentUserId } from "./_client";

export async function sendCallQuestion(question: string): Promise<void> {
  const agentId = await getCurrentUserId();
  const { error } = await supabase
    .from("call_questions")
    .insert({ agent_id: agentId, question });
  if (error) throw new Error(error.message);
}

export async function sendTicket(args: {
  type: string;
  priority: string;
  message: string;
}): Promise<{ emailed: boolean }> {
  const { data, error } = await supabase.functions.invoke(
    "send-ticket-email",
    { body: args },
  );
  if (error) throw new Error(error.message);
  return { emailed: data?.emailed ?? false };
}
