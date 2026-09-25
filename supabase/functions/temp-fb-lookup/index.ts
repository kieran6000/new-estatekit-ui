import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Neutralized: one-time migration helper, job done. See temp-onboard-one for
// the same pattern -- kept as an inert stub rather than deleted.
Deno.serve(() => new Response(JSON.stringify({ error: "gone - one-time migration helper, no longer needed" }), { status: 410, headers: { "Content-Type": "application/json" } }));
