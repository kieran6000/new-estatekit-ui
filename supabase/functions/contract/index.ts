import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cleanScroll, cleanSeconds, documentHash, firstIp, maskPhone, phoneDigits, validInitials, validSignature, validSignerName } from "./rules.ts";

// Contracts clients read and sign (Accounts → Contracts).
//
//   { action: "create", agentId?, title, signerName, company?, phone, email?, document }   operator only
//   { action: "shared", id, how }      operator only: the link was sent or copied
//   { action: "void", id }             operator only: cancels an unsigned contract
//   { action: "preview", token }       what a WhatsApp link preview may show
//   { action: "view", token, session } the contract; a new visit is logged
//   { action: "beat", token, session, seconds, scroll }  time on the page, how far read
//   { action: "sign", token, session, name, signature, initials, agreed }
//   { action: "my_signature" }         operator only: EstateKit's signature, on every contract
//   { action: "save_signature", signature }  only the account it belongs to
//
// verify_jwt is off because clients aren't signed in. Operator actions check
// the caller themselves, and an operator looking at a contract isn't logged:
// the team checking it must not read as "the client opened it".

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};
const APP = "https://leads.estatekit.co";
// The agreement names Kieran as the provider, so only that account's handwriting goes on it.
const PROVIDER_ACCOUNT = "c5beabe6-e009-4880-8506-59383f053312";
const TEXTMEBOT_URL = "https://api.textmebot.com/send.php";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function caller(req: Request): Promise<{ id: string; isOperator: boolean; name: string } | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const { data } = await supabase.auth.getUser(token);
    const id = data.user?.id;
    if (!id) return null;
    const { data: p } = await supabase.from("agent_profiles").select("is_operator, display_name").eq("agent_id", id).maybeSingle();
    return { id, isOperator: !!p?.is_operator, name: p?.display_name ?? "" };
  } catch {
    return null;
  }
}

async function sendWhatsApp(digits: string, text: string): Promise<boolean> {
  const apiKey = Deno.env.get("TEXTMEBOT_API_KEY");
  if (!apiKey) return false;
  const url = `${TEXTMEBOT_URL}?recipient=${digits}&apikey=${apiKey}&text=${encodeURIComponent(text)}`;
  // TextMeBot allows one message per ~5s per account. One retry covers a
  // clash with an automation alert going out at the same moment.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url);
    const body = await res.text();
    if (res.ok) return true;
    if (attempt === 0 && /messages? per \d+ seconds?/i.test(body)) { await new Promise((r) => setTimeout(r, 6000)); continue; }
    console.error("TextMeBot send failed", res.status, body.slice(0, 300));
    return false;
  }
  return false;
}

const place = (req: Request) => ({
  ip: firstIp(req.headers.get("x-forwarded-for")),
  user_agent: (req.headers.get("user-agent") ?? "").slice(0, 400) || null,
});

const logEvent = (contractId: string, type: string, extra: Record<string, unknown> = {}) =>
  supabase.from("contract_events").insert({ contract_id: contractId, type, ...extra }).then(({ error }) => {
    if (error) console.error("contract event not saved", type, error.message);
  });

const validToken = (t: unknown): t is string => typeof t === "string" && /^[0-9a-f]{32}$/.test(t);
const validSession = (s: unknown): s is string => typeof s === "string" && s.length >= 8 && s.length <= 64;
const open = (row: { signed_at: string | null; voided_at: string | null }) => !row.signed_at && !row.voided_at;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }

  try {
    if (body.action === "my_signature" || body.action === "save_signature") {
      const who = await caller(req);
      if (!who?.isOperator) return json({ error: "Only EstateKit staff can do this." }, 403);
      if (body.action === "save_signature") {
        if (who.id !== PROVIDER_ACCOUNT) return json({ error: "Only Kieran can change this signature." }, 403);
        if (!validSignature(body.signature)) return json({ error: "That signature didn't save. Try again." }, 400);
        const { error } = await supabase.from("contract_staff_signatures").upsert({ agent_id: who.id, signature_png: body.signature, updated_at: new Date().toISOString() });
        if (error) {
          console.error("signature save failed", error);
          return json({ error: "That signature didn't save. Try again." }, 500);
        }
        return json({ ok: true });
      }
      const { data } = await supabase.from("contract_staff_signatures").select("signature_png").eq("agent_id", PROVIDER_ACCOUNT).maybeSingle();
      return json({ signature: data?.signature_png ?? null, canChange: who.id === PROVIDER_ACCOUNT });
    }

    if (body.action === "create") {
      const who = await caller(req);
      if (!who?.isOperator) return json({ error: "Only EstateKit staff can create contracts." }, 403);
      const title = String(body.title ?? "").trim().slice(0, 120);
      const signerName = String(body.signerName ?? "").trim().slice(0, 120);
      const phone = phoneDigits(String(body.phone ?? ""));
      const agentId = body.agentId ? String(body.agentId) : null;
      if (agentId && !/^[0-9a-f-]{36}$/.test(agentId)) return json({ error: "Bad request" }, 400);
      if (!title || !signerName || typeof body.document !== "object" || !body.document) return json({ error: "Bad request" }, 400);
      if (!phone) return json({ error: "That WhatsApp number doesn't look right. Check it and try again." }, 400);

      const { data: row, error } = await supabase
        .from("contracts")
        .insert({
          token: crypto.randomUUID().replace(/-/g, ""),
          agent_id: agentId,
          title,
          signer_name: signerName,
          signer_company: body.company ? String(body.company).trim().slice(0, 160) : null,
          signer_phone: phone,
          signer_email: body.email ? String(body.email).trim().slice(0, 160) : null,
          document: body.document,
          document_hash: await documentHash(body.document),
          created_by: who.id,
          created_by_name: who.name,
        })
        .select("id, reference")
        .single();
      if (error || !row) {
        console.error("contract insert failed", error);
        return json({ error: "Couldn't save the contract. Try again." }, 500);
      }
      await logEvent(row.id, "created", { actor: who.name });
      return json({ ok: true, id: row.id, reference: row.reference });
    }

    if (body.action === "shared" || body.action === "void") {
      const who = await caller(req);
      if (!who?.isOperator) return json({ error: "Only EstateKit staff can do this." }, 403);
      const id = String(body.id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Bad request" }, 400);
      const { data: row } = await supabase.from("contracts").select("id, shared_at, signed_at, voided_at").eq("id", id).maybeSingle();
      if (!row) return json({ error: "That contract isn't there any more." }, 404);

      if (body.action === "shared") {
        if (!row.shared_at) await supabase.from("contracts").update({ shared_at: new Date().toISOString() }).eq("id", id);
        await logEvent(id, body.how === "whatsapp" ? "sent_whatsapp" : "link_copied", { actor: who.name });
        return json({ ok: true });
      }
      if (row.signed_at) return json({ error: "A signed contract can't be cancelled." }, 409);
      if (!row.voided_at) {
        await supabase.from("contracts").update({ voided_at: new Date().toISOString(), voided_by_name: who.name }).eq("id", id);
        await logEvent(id, "cancelled", { actor: who.name });
      }
      return json({ ok: true });
    }

    // Everything below starts from the private link.
    const token = body.token;
    if (!validToken(token)) return json({ error: "not_found" }, 404);
    const { data: row } = await supabase.from("contracts").select("*").eq("token", token).maybeSingle();
    if (!row) return json({ error: "not_found" }, 404);

    if (body.action === "preview") {
      return json({ title: row.title, reference: row.reference, signerName: row.signer_name, signed: !!row.signed_at, cancelled: !!row.voided_at });
    }

    if (body.action === "view") {
      const who = await caller(req);
      const staff = !!who?.isOperator;
      if (!staff && validSession(body.session)) {
        const { data: added } = await supabase
          .from("contract_views")
          .upsert({ contract_id: row.id, session_id: body.session, ...place(req) }, { onConflict: "contract_id,session_id", ignoreDuplicates: true })
          .select("id");
        const now = new Date().toISOString();
        if (added?.length) {
          await supabase.from("contracts").update({ first_opened_at: row.first_opened_at ?? now, last_opened_at: now, open_count: row.open_count + 1 }).eq("id", row.id);
          await logEvent(row.id, "opened", place(req));
        } else {
          await supabase.from("contracts").update({ last_opened_at: now }).eq("id", row.id);
        }
      }
      if (row.voided_at) return json({ status: "cancelled", reference: row.reference, title: row.title, staff });
      return json({
        status: row.signed_at ? "signed" : "open",
        staff,
        reference: row.reference,
        title: row.title,
        document: row.document,
        documentHash: row.document_hash,
        issuedBy: row.created_by_name,
        issuedAt: row.created_at,
        signerName: row.signer_name,
        maskedPhone: maskPhone(row.signer_phone),
        signed: row.signed_at
          ? { at: row.signed_at, name: row.signed_name, initials: row.signed_initials, signature: row.signature_png, maskedPhone: maskPhone(row.signed_phone ?? row.signer_phone), ip: row.signed_ip, userAgent: row.signed_user_agent }
          : null,
      });
    }

    if (body.action === "beat") {
      if (!validSession(body.session)) return json({ ok: false }, 400);
      const { data: view } = await supabase.from("contract_views").select("id, seconds, max_scroll").eq("contract_id", row.id).eq("session_id", body.session).maybeSingle();
      if (!view) return json({ ok: false });
      const seconds = cleanSeconds(body.seconds);
      const scroll = cleanScroll(body.scroll);
      await supabase.from("contract_views").update({ seconds: view.seconds + seconds, max_scroll: Math.max(view.max_scroll, scroll), last_seen_at: new Date().toISOString() }).eq("id", view.id);
      const readToEnd = scroll >= 98 && !row.read_to_end_at;
      await supabase.from("contracts").update({
        seconds_read: row.seconds_read + seconds,
        max_scroll: Math.max(row.max_scroll, scroll),
        ...(readToEnd ? { read_to_end_at: new Date().toISOString() } : {}),
      }).eq("id", row.id);
      if (readToEnd) await logEvent(row.id, "read_to_end", place(req));
      return json({ ok: true });
    }

    if (body.action === "sign") {
      if (!open(row)) return json({ error: "This agreement can't be signed any more." }, 409);
      if (body.agreed !== true) return json({ error: "Tick the box to confirm you agree." }, 400);
      if (!validSignerName(body.name)) return json({ error: "Type your full name, first name and surname." }, 400);
      if (!validSignature(body.signature)) return json({ error: "Add your signature first." }, 400);
      const needsInitials = !!(row.document as { initials?: boolean }).initials;
      if (needsInitials && !validInitials(body.initials)) return json({ error: "Add your initials." }, 400);

      // The wording they read is still the wording that was issued.
      if (await documentHash(row.document) !== row.document_hash) {
        console.error("contract fingerprint mismatch", row.id);
        return json({ error: "This agreement can't be signed right now. Contact EstateKit." }, 409);
      }

      const { ip, user_agent } = place(req);
      const { data: signed, error } = await supabase
        .from("contracts")
        .update({ signed_at: new Date().toISOString(), signed_name: body.name.trim().replace(/\s+/g, " "), signature_png: body.signature, signed_initials: needsInitials ? String(body.initials).trim() : null, signed_phone: row.signer_phone, signed_ip: ip, signed_user_agent: user_agent })
        .eq("id", row.id)
        .is("signed_at", null)
        .is("voided_at", null)
        .select("id");
      if (error || !signed?.length) {
        console.error("contract sign failed", error);
        return json({ error: "That didn't go through. Try again." }, 500);
      }
      await logEvent(row.id, "signed", { ip, user_agent });

      const link = `${APP}/c/${token}`;
      const first = String(row.signer_name).split(/\s+/)[0];
      EdgeRuntime.waitUntil(sendWhatsApp(row.signer_phone, `Hi ${first}, your EstateKit agreement ${row.reference} is signed. Keep this link for your signed copy:\n${link}`));
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("contract failed:", err);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
