import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Neutralized: this was a temporary duplicate of create-agent used only to
// confirm deploy permissions during a migration task. Use create-agent instead.
Deno.serve(() => new Response(JSON.stringify({ error: "gone - use create-agent" }), { status: 410, headers: { "Content-Type": "application/json" } }));
