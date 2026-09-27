// The confirmation email's "message me on WhatsApp" link:
//   leads.estatekit.co/w/<lead id>  (Vercel rewrite)  →  here  →  wa.me/…
//
// Records the click in the lead's history (email_clicked), then sends the
// person straight on to WhatsApp with the same pre-filled message as before.
// The destination is always built here from the lead and agent on record,
// never taken from the URL, so this can't be used to redirect anywhere else.
// Lead ids are random UUIDs, so they can't be guessed.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FALLBACK = "https://leads.estatekit.co/";

const first = (s: string | null | undefined) => (s || "").trim().split(/\s+/)[0] || "";
const digits = (s: string | null | undefined) => {
  const d = (s || "").replace(/\D/g, "");
  return d.length === 10 && d.startsWith("0") ? "27" + d.slice(1) : d;
};
const isMobile = (d: string) => /^27[6-8]\d{8}$/.test(d);
const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  const id = new URL(req.url).searchParams.get("l") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return redirect(FALLBACK);

  const { data: lead } = await supabase.from("leads").select("id, name, agent_id, pipeline_id, source_page_id, form_answers").eq("id", id).maybeSingle();
  if (!lead) return redirect(FALLBACK);

  const [{ data: agent }, { data: page }, { data: pipeline }] = await Promise.all([
    supabase.from("agent_profiles").select("display_name, whatsapp_number").eq("agent_id", lead.agent_id).maybeSingle(),
    lead.source_page_id ? supabase.from("lead_pages").select("agent_name, phone").eq("id", lead.source_page_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("pipelines").select("kind").eq("id", lead.pipeline_id).maybeSingle(),
  ]);

  // Same number and message as the email (see send-lead-confirmation).
  const waNumber = [digits(agent?.whatsapp_number), digits(page?.phone)].find(isMobile) || "";
  if (!waNumber) return redirect(FALLBACK);
  const agentFirst = first(agent?.display_name || page?.agent_name) || "there";
  const answers = Array.isArray(lead.form_answers) ? (lead.form_answers as { q?: string; a?: string }[]) : [];
  let address = (answers.find((x) => /address/i.test(x.q || ""))?.a || "").trim().slice(0, 160);
  if (address === address.toLowerCase()) address = address.replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const what =
    pipeline?.kind === "buyer"
      ? "I just sent you my details about finding a home."
      : pipeline?.kind === "general"
        ? "I just sent you my details."
        : `I just requested a home evaluation${address ? ` for ${address}` : ""}.`;
  const text = `Hi ${agentFirst}, it's ${first(lead.name) || lead.name}. ${what}`;

  // Record it, but never let that hold up the person on their way to WhatsApp.
  const { error } = await supabase.from("lead_events").insert({
    lead_id: lead.id,
    agent_id: lead.agent_id,
    event_type: "email_clicked",
    to_value: "Tapped \"message me on WhatsApp\"",
    source: "automation",
  });
  if (error) console.error("click log failed", error);

  return redirect(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`);
});
