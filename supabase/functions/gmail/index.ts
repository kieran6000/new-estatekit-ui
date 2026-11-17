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

/** The most of one email we will hold in memory and send to the browser. Far
 *  bigger than any real message; it's there so one freak email can't take the
 *  inbox down for everyone. */
const MAX_BODY = 1_500_000;

/** The biggest attachment we'll hand over. Base64 is a third bigger again, and
 *  past this the worker runs out of memory and the whole page stops. */
const MAX_ATTACHMENT = 18 * 1024 * 1024;

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

// --- Our own delivery ticks -------------------------------------------------
// Gmail tells us nothing about a mail once it has gone: no delivery, no opens,
// no clicks. So we do here what the automated emails already do - keep a row
// for every mail sent from this inbox, put a 1px picture at the bottom of it,
// and send each link through our own redirect. The real web addresses live in
// the database, never in the tracking link, so a tampered link cannot be made
// to point somewhere else.
const TRACK_BASE = "https://leads.estatekit.co";

const unentity = (v: string) =>
  v.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Worth following: ordinary web links only. Not mailto:, tel:, cid: pictures,
 *  in-page anchors, or a link we have already rewritten. */
const trackable = (href: string) =>
  /^https?:\/\//i.test(href) && !href.startsWith(TRACK_BASE + "/mc/") && !href.startsWith(TRACK_BASE + "/mo/");

const A_HREF = /(<a\b[^>]*?\shref=")([^"]+)(")/gi;

async function startTracking(o: { mailbox: string; to: string; cc?: string; subject: string; html: string; sentBy: string | null }): Promise<{ html: string; id: string | null }> {
  try {
    const { data: row, error } = await admin
      .from("mail_sent")
      .insert({
        mailbox: o.mailbox,
        to_emails: [o.to, o.cc].filter(Boolean).join(", ").slice(0, 2000),
        subject: (o.subject || "").slice(0, 500),
        sent_by: o.sentBy,
      })
      .select("id")
      .single();
    if (error || !row) throw error ?? new Error("no row");

    let html = o.html;

    // Each different link gets its own row, so we can say which one they tapped.
    const found: string[] = [];
    html.replace(A_HREF, (m, _a, href: string) => {
      const real = unentity(href);
      if (trackable(real)) found.push(real.slice(0, 2000));
      return m;
    });
    const unique = [...new Set(found)];
    if (unique.length > 0 && unique.length <= 60) {
      const { data: links } = await admin
        .from("mail_links")
        .insert(unique.map((url) => ({ mail_sent_id: row.id, url })))
        .select("id, url");
      const map = new Map((links ?? []).map((l: { id: string; url: string }) => [l.url, l.id]));
      html = html.replace(A_HREF, (m, a: string, href: string, c: string) => {
        const id = map.get(unentity(href).slice(0, 2000));
        return id ? a + TRACK_BASE + "/mc/" + id + c : m;
      });
    }

    // The open picture goes last, hidden.
    html += '<img src="' + TRACK_BASE + "/mo/" + row.id + '" width="1" height="1" alt="" style="display:none">';
    return { html, id: row.id };
  } catch (e) {
    // Ticks are a nice-to-have: never let them stop the mail going out.
    console.error("mail tracking setup failed", e);
    return { html: o.html, id: null };
  }
}

/** Every bit of text in a message, including the headers of any message tucked
 *  inside it - which is where a bounce keeps the original Message-ID. */
function collectText(payload: GPart | undefined): string {
  const out: string[] = [];
  const walk = (part: GPart | undefined) => {
    if (!part) return;
    for (const h of (part.headers ?? []) as Header[]) out.push(h.name + ": " + h.value);
    if (/^text\//i.test(part.mimeType ?? "") && part.body?.data) out.push(decodeB64Url(part.body.data));
    if (Array.isArray(part.parts)) part.parts.forEach(walk);
  };
  walk(payload);
  return out.join("\n");
}

type GPart = { mimeType?: string; headers?: Header[]; body?: { data?: string }; parts?: GPart[] };

// ── MIME builder for sending ────────────────────────────────────────────────
type Upload = { filename: string; mimeType: string; data: string }; // data = base64
/** An image embedded in the body, referenced by <img src="cid:…">. Sending it
 *  with the mail (instead of linking it) means it still shows years later. */
type Inline = Upload & { cid: string };

const normB64 = (d: string) => (d.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "").match(/.{1,76}/g) ?? []).join("\r\n");
const safe = (s: string) => s.replace(/[\r\n"]/g, "");

function filePart(boundary: string, a: Upload, disposition: "attachment" | "inline", cid?: string): string[] {
  const name = safe(a.filename || "file");
  return [
    `--${boundary}`,
    `Content-Type: ${safe(a.mimeType || "application/octet-stream")}; name="${name}"`,
    "Content-Transfer-Encoding: base64",
    ...(cid ? [`Content-ID: <${safe(cid)}>`, `X-Attachment-Id: ${safe(cid)}`] : []),
    `Content-Disposition: ${disposition}; filename="${name}"`,
    "",
    normB64(a.data),
  ];
}

function buildMime(o: {
  fromName: string; from: string; to: string; cc?: string; subject: string; html: string;
  inReplyTo?: string; references?: string; attachments?: Upload[]; inline?: Inline[];
}): string {
  const head = [
    `From: ${o.fromName ? `${safe(o.fromName)} <${o.from}>` : o.from}`,
    `To: ${o.to}`,
    ...(o.cc ? [`Cc: ${o.cc}`] : []),
    `Subject: ${encodeHeader(o.subject)}`,
    ...(o.inReplyTo ? [`In-Reply-To: ${o.inReplyTo}`] : []),
    ...(o.references ? [`References: ${o.references}`] : []),
    "MIME-Version: 1.0",
  ];
  const atts = (o.attachments ?? []).filter((a) => a.data);
  const inline = (o.inline ?? []).filter((a) => a.data && a.cid);

  const htmlPart = ['Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64Chunks(o.html)];

  // Plain message.
  if (atts.length === 0 && inline.length === 0) return [...head, ...htmlPart].join("\r\n");

  // The body, with its embedded images wrapped around it when there are any.
  let body: string[];
  let bodyHeader: string[];
  if (inline.length > 0) {
    const rel = `ekrel_${crypto.randomUUID().replace(/-/g, "")}`;
    const relParts = [`--${rel}`, ...htmlPart];
    for (const img of inline) relParts.push(...filePart(rel, img, "inline", img.cid));
    relParts.push(`--${rel}--`, "");
    bodyHeader = [`Content-Type: multipart/related; boundary="${rel}"`];
    body = ["", ...relParts];
  } else {
    bodyHeader = htmlPart.slice(0, 2);
    body = ["", b64Chunks(o.html)];
  }

  // No files to attach → the body alone is the whole message.
  if (atts.length === 0) return [...head, ...bodyHeader, ...body].join("\r\n");

  // Otherwise multipart/mixed: [ body (with its images) ][ each file ].
  const mix = `ekmix_${crypto.randomUUID().replace(/-/g, "")}`;
  const parts = [`--${mix}`, ...bodyHeader, ...body];
  for (const a of atts) parts.push(...filePart(mix, a, "attachment"));
  parts.push(`--${mix}--`, "");
  return [...head, `Content-Type: multipart/mixed; boundary="${mix}"`, "", ...parts].join("\r\n");
}
function b64Chunks(s: string): string {
  const b = btoa(unescape(encodeURIComponent(s)));
  return (b.match(/.{1,76}/g) ?? [b]).join("\r\n");
}
// RFC 2047 encode a header value when it has non-ASCII (so emoji/accents in
// subjects don't get mangled).
function encodeHeader(s: string): string {
  // deno-lint-ignore no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(s)))}?=`;
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
    const { data: mb } = await admin.from("mail_mailboxes").select("email, display_name, ready").eq("email", mailbox).maybeSingle();
    if (!mb) return json({ error: "Unknown mailbox." }, 400);
    if (mb.ready === false) return json({ error: "That mailbox isn't set up yet." }, 400);
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
            : folder === "archive"
              ? "-in:inbox -in:sent -in:trash -in:spam -in:drafts in:anywhere"
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
        // One message at a time, each one cut down to what the screen needs
        // before the next is fetched. Asking for the whole conversation in one
        // piece is what used to run the worker out of memory on a long
        // back-and-forth, and a worker that dies takes the whole page with it.
        const t = await gmail(mailbox, `/threads/${payload.id}?format=minimal`);
        const refs = (t.messages ?? []) as { id: string; labelIds?: string[] }[];
        const messages: any[] = [];
        for (const ref of refs) {
          const m = await gmail(mailbox, `/messages/${ref.id}?format=full`);
          const hs: Header[] = m.payload?.headers ?? [];
          const { html, text } = extractBody(m.payload);
          const body = html || (text ? `<pre style="white-space:pre-wrap;font:inherit;margin:0">${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</pre>` : "");
          messages.push({
            id: m.id,
            messageId: header(hs, "Message-ID"),
            from: parseFrom(header(hs, "From")),
            to: header(hs, "To"),
            cc: header(hs, "Cc"),
            subject: header(hs, "Subject"),
            date: header(hs, "Date"),
            unread: (m.labelIds ?? []).includes("UNREAD"),
            html: body.length > MAX_BODY
              ? body.slice(0, MAX_BODY) + `<p style="color:#5f6368">This email is too long to show all of it here. Open it in Gmail to read the rest.</p>`
              : body,
            attachments: listAttachments(m.payload),
          });
        }
        // Opening a thread marks it read.
        if (refs.some((m) => (m.labelIds ?? []).includes("UNREAD"))) {
          await gmail(mailbox, `/threads/${payload.id}/modify`, { method: "POST", body: JSON.stringify({ removeLabelIds: ["UNREAD"] }) });
        }
        return json({ messages, subject: messages[0]?.subject ?? "(no subject)" });
      }

      case "send": {
        const { data: mbRow } = await admin.from("mail_mailboxes").select("display_name").eq("email", mailbox).maybeSingle();
        const subject = payload.subject || "(no subject)";
        const tracked = await startTracking({
          mailbox,
          to: String(payload.to ?? ""),
          cc: payload.cc || undefined,
          subject,
          html: payload.html || "",
          sentBy: callerId,
        });
        const mime = buildMime({
          fromName: mbRow?.display_name || payload._display || "",
          from: mailbox,
          to: payload.to,
          cc: payload.cc || undefined,
          subject,
          html: tracked.html,
          inReplyTo: payload.inReplyTo || undefined,
          references: payload.references || payload.inReplyTo || undefined,
          attachments: Array.isArray(payload.attachments) ? payload.attachments : undefined,
          inline: Array.isArray(payload.inline) ? payload.inline : undefined,
        });
        const sent = await gmail(mailbox, `/messages/send`, {
          method: "POST",
          body: JSON.stringify({ raw: b64url(new TextEncoder().encode(mime)), ...(payload.threadId ? { threadId: payload.threadId } : {}) }),
        });
        // Note which mail this became, and its Message-ID, so the ticks sit on
        // the right message and a bounce can be matched back to it.
        if (tracked.id) {
          try {
            const meta = await gmail(mailbox, `/messages/${sent.id}?format=metadata&metadataHeaders=Message-ID`);
            await admin
              .from("mail_sent")
              .update({ gmail_id: sent.id, thread_id: sent.threadId, message_id: header(meta.payload?.headers ?? [], "Message-ID") })
              .eq("id", tracked.id);
          } catch (e) {
            console.error("mail tracking link-up failed", e);
          }
        }
        return json({ ok: true, id: sent.id, threadId: sent.threadId });
      }

      case "modify": {
        // mark read/unread, archive (remove INBOX) or put a thread back in the
        // inbox. Nothing here deletes mail: archiving is the only way out.
        const add: string[] = [];
        const remove: string[] = [];
        if (payload.read === true) remove.push("UNREAD");
        if (payload.read === false) add.push("UNREAD");
        if (payload.archive) remove.push("INBOX");
        if (payload.unarchive) add.push("INBOX");
        await gmail(mailbox, `/threads/${payload.id}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }) });
        return json({ ok: true });
      }

      case "attachment": {
        const a = await gmail(mailbox, `/messages/${payload.messageId}/attachments/${payload.attachmentId}`);
        if ((a.size ?? 0) > MAX_ATTACHMENT) {
          return json({ error: "That file is too big to open here. Open this email in Gmail to get it." }, 400);
        }
        return json({ data: a.data, size: a.size });
      }

      case "unread": {
        // Just the count of unread inbox threads, for the nav badge. Cheap:
        // one list call, read resultSizeEstimate.
        const r = await gmail(mailbox, `/threads?maxResults=100&q=${encodeURIComponent("in:inbox is:unread")}`);
        return json({ count: (r.threads ?? []).length, more: !!r.nextPageToken });
      }

      case "sent-status": {
        // The ticks for mail we sent from here. Opens and taps come from our
        // own picture and links; "did not arrive" comes from the bounce sweep.
        const ids: string[] = Array.isArray(payload.threadIds) ? payload.threadIds.slice(0, 60) : [];
        if (ids.length === 0) return json({ rows: [] });
        const { data, error } = await admin
          .from("mail_sent")
          .select("gmail_id, thread_id, sent_at, opened_at, open_count, clicked_at, click_count, bounced_at, bounce_reason")
          .eq("mailbox", mailbox)
          .in("thread_id", ids);
        if (error) return json({ rows: [], notReady: true });
        return json({ rows: data ?? [] });
      }

      case "bounces": {
        // Email has no delivery receipt; what it has is a bounce coming back.
        // So we read the mailer-daemon mail in this mailbox and match it to
        // what we sent. Anything that has not bounced after a while is, as far
        // as email can ever tell, delivered.
        const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
        const { data: pending, error: pendErr } = await admin
          .from("mail_sent")
          .select("id, message_id")
          .eq("mailbox", mailbox)
          .is("bounced_at", null)
          .not("message_id", "is", null)
          .gte("sent_at", since)
          .limit(500);
        if (pendErr || !pending?.length) return json({ ok: true, found: 0 });

        const byMsgId = new Map<string, string>();
        for (const r of pending) if (r.message_id) byMsgId.set(String(r.message_id).toLowerCase().trim(), r.id);

        const hits = await gmail(mailbox, `/messages?maxResults=8&q=${encodeURIComponent("(from:mailer-daemon OR from:postmaster) newer_than:14d")}`);
        let found = 0;
        for (const ref of (hits.messages ?? []) as { id: string }[]) {
          if (byMsgId.size === 0) break;
          const full = await gmail(mailbox, `/messages/${ref.id}?format=full`);
          const blob = collectText(full.payload) + "\n" + (full.snippet ?? "");
          const seen = new Set((blob.match(/<[^<>\s@]+@[^<>\s]+>/g) ?? []).map((x) => x.toLowerCase()));
          // The address that failed is plain enough to show someone; the rest
          // of a bounce report is technical, so it stays in the logs.
          const failed = (header(full.payload?.headers ?? [], "X-Failed-Recipients") || "").split(",")[0].trim();
          for (const candidate of seen) {
            const mailId = byMsgId.get(candidate);
            if (!mailId) continue;
            await admin
              .from("mail_sent")
              .update({ bounced_at: new Date().toISOString(), bounce_reason: /^[^@\s]+@[^@\s]+$/.test(failed) ? failed : null })
              .eq("id", mailId);
            byMsgId.delete(candidate);
            found++;
          }
        }
        return json({ ok: true, found });
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
