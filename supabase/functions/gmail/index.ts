// The team inbox backend. Reads and sends real Google Workspace mail for the
// Mail tab, using a service account with domain-wide delegation: it mints a
// short-lived access token that impersonates the chosen @estatekit.co mailbox,
// then calls the Gmail REST API as that mailbox.
//
// Setup (one time, by a Workspace super-admin):
//   1. GCP project -> enable Gmail API -> service account -> JSON key.
//   2. On the service account, enable domain-wide delegation; note its Client ID.
//   3. admin.google.com -> Security -> API controls -> Domain-wide delegation:
//      add the Client ID with scope https://www.googleapis.com/auth/gmail.modify
//   4. Set the whole JSON key as the GOOGLE_SA_KEY secret on this function.
//
// Only EstateKit operators can call it, and only for a mailbox listed in
// public.mail_mailboxes. Signatures and the mailbox list live in that table and
// are read straight from the client; this function only touches Gmail.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ── Google auth: service-account JWT -> impersonated access token ───────────
const SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const tokenCache = new Map<string, { token: string; exp: number }>();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlStr(s: string): string {
  return b64url(new TextEncoder().encode(s));
}
function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function accessTokenFor(mailbox: string): Promise<string> {
  const cached = tokenCache.get(mailbox);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;

  const raw = Deno.env.get("GOOGLE_SA_KEY");
  if (!raw) throw new Error("not-configured");
  let sa: { client_email: string; private_key: string };
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error("bad-sa-key");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    sub: mailbox, // impersonate this mailbox (domain-wide delegation)
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const assertion = `${unsigned}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`google-auth: ${data.error ?? res.status} ${data.error_description ?? ""}`.trim());
  tokenCache.set(mailbox, { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 });
  return data.access_token;
}

async function gmail(mailbox: string, path: string, init?: RequestInit): Promise<any> {
  const token = await accessTokenFor(mailbox);
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(mailbox)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`gmail ${res.status}: ${body?.error?.message ?? text.slice(0, 200)}`);
  return body;
}

// ── Message parsing helpers ─────────────────────────────────────────────────
type Header = { name: string; value: string };
const header = (hs: Header[], name: string) => hs.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

function parseFrom(v: string): { name: string; email: string } {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim() };
  return { name: v.trim(), email: v.trim() };
}

function decodeB64Url(data: string): string {
  try {
    const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

// Walk a payload tree; prefer text/html, fall back to text/plain.
function extractBody(payload: any): { html: string; text: string } {
  let html = "";
  let text = "";
  const walk = (p: any) => {
    if (!p) return;
    const mime = p.mimeType ?? "";
    if (mime === "text/html" && p.body?.data) html += decodeB64Url(p.body.data);
    else if (mime === "text/plain" && p.body?.data) text += decodeB64Url(p.body.data);
    if (Array.isArray(p.parts)) p.parts.forEach(walk);
  };
  walk(payload);
  return { html, text };
}

function listAttachments(payload: any): { filename: string; mimeType: string; size: number; attachmentId: string }[] {
  const out: { filename: string; mimeType: string; size: number; attachmentId: string }[] = [];
  const walk = (p: any) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) out.push({ filename: p.filename, mimeType: p.mimeType ?? "", size: p.body.size ?? 0, attachmentId: p.body.attachmentId });
    if (Array.isArray(p.parts)) p.parts.forEach(walk);
  };
  walk(payload);
  return out;
}

// ── MIME builder for sending ────────────────────────────────────────────────
function buildMime(o: { fromName: string; from: string; to: string; cc?: string; subject: string; html: string; inReplyTo?: string; references?: string }): string {
  const lines = [
    `From: ${o.fromName ? `${o.fromName.replace(/[\r\n"]/g, "")} <${o.from}>` : o.from}`,
    `To: ${o.to}`,
    ...(o.cc ? [`Cc: ${o.cc}`] : []),
    `Subject: ${o.subject}`,
    ...(o.inReplyTo ? [`In-Reply-To: ${o.inReplyTo}`] : []),
    ...(o.references ? [`References: ${o.references}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Chunks(o.html),
  ];
  return lines.join("\r\n");
}
function b64Chunks(s: string): string {
  const b = btoa(unescape(encodeURIComponent(s)));
  return (b.match(/.{1,76}/g) ?? [b]).join("\r\n");
}

// ── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Caller must be an operator.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(jwt);
  const callerId = who?.user?.id;
  if (!callerId) return json({ error: "Not signed in." }, 401);
  const { data: caller } = await admin.from("agent_profiles").select("is_operator").eq("agent_id", callerId).maybeSingle();
  if (!caller?.is_operator) return json({ error: "Only EstateKit staff can use the inbox." }, 403);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const { action, mailbox } = payload;

  // Mailbox must be one we manage.
  if (action !== "ping") {
    const { data: mb } = await admin.from("mail_mailboxes").select("email, display_name").eq("email", mailbox).maybeSingle();
    if (!mb) return json({ error: "Unknown mailbox." }, 400);
    payload._display = mb.display_name;
  }

  try {
    switch (action) {
      case "list": {
        const folder: string = payload.folder || "inbox";
        const q = payload.q
          ? String(payload.q)
          : folder === "sent"
            ? "in:sent"
            : folder === "all"
              ? "in:all -in:trash -in:spam"
              : "in:inbox";
        const listed = await gmail(mailbox, `/threads?maxResults=25&q=${encodeURIComponent(q)}${payload.pageToken ? `&pageToken=${payload.pageToken}` : ""}`);
        const ids: string[] = (listed.threads ?? []).map((t: any) => t.id);
        const threads = await Promise.all(
          ids.map(async (id) => {
            const t = await gmail(mailbox, `/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
            const msgs = t.messages ?? [];
            const last = msgs[msgs.length - 1];
            const hs: Header[] = last?.payload?.headers ?? [];
            const unread = msgs.some((m: any) => (m.labelIds ?? []).includes("UNREAD"));
            const who = folder === "sent" ? parseFrom(header(hs, "To")) : parseFrom(header(hs, "From"));
            return {
              id,
              subject: header(hs, "Subject") || "(no subject)",
              who,
              snippet: last?.snippet ?? "",
              date: header(hs, "Date"),
              unread,
              count: msgs.length,
            };
          }),
        );
        return json({ threads, nextPageToken: listed.nextPageToken ?? null });
      }

      case "thread": {
        const t = await gmail(mailbox, `/threads/${payload.id}?format=full`);
        const messages = (t.messages ?? []).map((m: any) => {
          const hs: Header[] = m.payload?.headers ?? [];
          const { html, text } = extractBody(m.payload);
          return {
            id: m.id,
            messageId: header(hs, "Message-ID"),
            from: parseFrom(header(hs, "From")),
            to: header(hs, "To"),
            cc: header(hs, "Cc"),
            subject: header(hs, "Subject"),
            date: header(hs, "Date"),
            unread: (m.labelIds ?? []).includes("UNREAD"),
            html: html || (text ? `<pre style="white-space:pre-wrap;font:inherit;margin:0">${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</pre>` : ""),
            attachments: listAttachments(m.payload),
          };
        });
        // Opening a thread marks it read.
        if ((t.messages ?? []).some((m: any) => (m.labelIds ?? []).includes("UNREAD"))) {
          await gmail(mailbox, `/threads/${payload.id}/modify`, { method: "POST", body: JSON.stringify({ removeLabelIds: ["UNREAD"] }) });
        }
        return json({ messages, subject: messages[0]?.subject ?? "(no subject)" });
      }

      case "send": {
        const { data: mbRow } = await admin.from("mail_mailboxes").select("display_name").eq("email", mailbox).maybeSingle();
        const mime = buildMime({
          fromName: mbRow?.display_name || payload._display || "",
          from: mailbox,
          to: payload.to,
          cc: payload.cc || undefined,
          subject: payload.subject || "(no subject)",
          html: payload.html || "",
          inReplyTo: payload.inReplyTo || undefined,
          references: payload.references || payload.inReplyTo || undefined,
        });
        const sent = await gmail(mailbox, `/messages/send`, {
          method: "POST",
          body: JSON.stringify({ raw: b64url(new TextEncoder().encode(mime)), ...(payload.threadId ? { threadId: payload.threadId } : {}) }),
        });
        return json({ ok: true, id: sent.id, threadId: sent.threadId });
      }

      case "modify": {
        // mark read/unread, archive (remove INBOX), or trash a whole thread.
        if (payload.trash) {
          await gmail(mailbox, `/threads/${payload.id}/trash`, { method: "POST" });
          return json({ ok: true });
        }
        const add: string[] = [];
        const remove: string[] = [];
        if (payload.read === true) remove.push("UNREAD");
        if (payload.read === false) add.push("UNREAD");
        if (payload.archive) remove.push("INBOX");
        await gmail(mailbox, `/threads/${payload.id}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }) });
        return json({ ok: true });
      }

      case "attachment": {
        const a = await gmail(mailbox, `/messages/${payload.messageId}/attachments/${payload.attachmentId}`);
        return json({ data: a.data, size: a.size });
      }

      default:
        return json({ error: `unknown action ${action}` }, 400);
    }
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    if (msg === "not-configured") return json({ error: "not-configured", detail: "The Gmail service account key (GOOGLE_SA_KEY) isn't set yet." }, 503);
    if (msg === "bad-sa-key") return json({ error: "The GOOGLE_SA_KEY secret isn't valid JSON." }, 500);
    console.error("gmail fn error", msg);
    return json({ error: msg }, 500);
  }
});
