import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Neutralized 25 Sept 2026: this was a full account-takeover hole.
//
// - A hardcoded dev backdoor (+10000000000 / 0000) returned a session to
//   anyone, and created that user with is_operator = true: every lead, every
//   agent, password resets, ad controls.
// - 4-digit codes with no attempt limit and no expiry, and a match on an
//   EXISTING account's phone, so any real account (all 17 have a phone set,
//   including the operator) could be taken over in ~9,000 requests.
//
// Nothing in the app calls it: login is phone + password (src/api/auth.ts).
// It also minted a second, empty account per phone under @phone.estatekit.co,
// which is where the duplicate accounts came from. The original is in git
// history (commit 095a5a5) if WhatsApp login is ever rebuilt properly.
Deno.serve(() => new Response(JSON.stringify({ error: "gone - WhatsApp code login is disabled" }), { status: 410, headers: { "Content-Type": "application/json" } }));
