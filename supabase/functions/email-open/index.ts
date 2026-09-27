// The confirmation email's open pixel:
//   leads.estatekit.co/o/<lead id>  (Vercel rewrite)  →  here  →  1x1 GIF
//
// Records the first open in the lead's history (email_opened). Always answers
// with the image, whatever happens, so the email never shows a broken image.
// A rough guide only: some email apps (Apple Mail) load images for the reader
// before it is opened, and some block images, so the stats card says so.
// Hits in the first few seconds after sending are skipped: those are mail
// scanners checking the email, not the person.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Transparent 1x1 GIF.
const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));
const pixel = () =>
  new Response(GIF, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", Pragma: "no-cache" },
  });

const SCANNER_WINDOW_MS = 10_000;

Deno.serve(async (req) => {
  const id = new URL(req.url).searchParams.get("l") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return pixel();

  try {
    const { data: lead } = await supabase.from("leads").select("id, agent_id, confirmation_sent_at").eq("id", id).maybeSingle();
    if (!lead?.confirmation_sent_at) return pixel();
    if (Date.now() - new Date(lead.confirmation_sent_at).getTime() < SCANNER_WINDOW_MS) return pixel();

    // First open only.
    const { count } = await supabase.from("lead_events").select("id", { count: "exact", head: true }).eq("lead_id", id).eq("event_type", "email_opened");
    if ((count ?? 0) === 0) {
      const { error } = await supabase.from("lead_events").insert({
        lead_id: id,
        agent_id: lead.agent_id,
        event_type: "email_opened",
        to_value: "Opened the email",
        source: "automation",
      });
      if (error) console.error("open log failed", error);
    }
  } catch (e) {
    console.error("open pixel failed", e);
  }
  return pixel();
});
