import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Neutralized: one-time message sent, job done.
Deno.serve(() => new Response(JSON.stringify({ error: "gone - one-time helper, no longer needed" }), { status: 410, headers: { "Content-Type": "application/json" } }));
