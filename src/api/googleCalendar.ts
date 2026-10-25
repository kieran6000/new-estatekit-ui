import { supabase } from "./_client";

// Connect your Google Calendar (Get set up): the signed-in agent's own Google
// account. See supabase/functions/google-calendar and google-calendar-sync.

/** Sends them to Google's "allow" page; Google brings them back to returnTo
 *  with ?calendar=connected (or error / cancelled). */
export async function connectGoogleCalendar(returnTo = "/setup"): Promise<void> {
  const { data, error } = await supabase.functions.invoke("google-calendar", { body: { action: "connect", returnTo } });
  if (data?.error === "not_configured") throw new Error("not_configured");
  if (error || !data?.url) throw new Error(data?.error || error?.message || "no url");
  window.location.assign(data.url);
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const { data, error } = await supabase.functions.invoke("google-calendar", { body: { action: "disconnect" } });
  if (error || !data?.ok) throw new Error(data?.error || error?.message || "not disconnected");
}
