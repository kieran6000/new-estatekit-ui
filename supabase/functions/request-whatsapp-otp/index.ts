import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Neutralized 25 Sept 2026. With no authentication and no rate limit, anyone
// could make our TextMeBot WhatsApp number message any phone number, as often
// as they liked. That's a spam-ban risk for the number every agent's lead
// alerts go out on. It also fed verify-whatsapp-otp, which is disabled for
// being an account-takeover hole (see that file).
//
// Nothing in the app calls it. The original is in git history (commit 095a5a5).
Deno.serve(() => new Response(JSON.stringify({ error: "gone - WhatsApp code login is disabled" }), { status: 410, headers: { "Content-Type": "application/json" } }));
