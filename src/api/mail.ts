import { supabase } from "./_client";

// The team inbox. Mailbox list + signatures come straight from the
// mail_mailboxes table (operators can read/update it). Reading and sending the
// actual Google Workspace mail goes through the `gmail` edge function.

export interface Mailbox {
  email: string;
  display_name: string;
  signature: string;
  sort: number;
}

export interface ThreadSummary {
  id: string;
  subject: string;
  who: { name: string; email: string };
  snippet: string;
  date: string;
  unread: boolean;
  count: number;
}

export interface MessageFull {
  id: string;
  messageId: string;
  from: { name: string; email: string };
  to: string;
  cc: string;
  subject: string;
  date: string;
  unread: boolean;
  html: string;
  attachments: { filename: string; mimeType: string; size: number; attachmentId: string }[];
}

export type Folder = "inbox" | "sent" | "archive" | "all";

/** A file the user is attaching to an outgoing message. `data` is base64. */
export interface Upload {
  filename: string;
  mimeType: string;
  data: string;
}

/** A picture inside the body. It travels with the mail (referenced as
 *  `cid:<cid>` in the html) so it still shows for the reader years later —
 *  a linked image would break as soon as its link expired. */
export interface Inline extends Upload {
  cid: string;
}

/** Raised when the Gmail service account hasn't been connected yet. */
export class MailNotConnected extends Error {}

export async function listMailboxes(): Promise<Mailbox[]> {
  // Only the inboxes that are actually connected — the rest of the team's
  // addresses are coming, and a box that can't open shouldn't be offered.
  const { data, error } = await supabase
    .from("mail_mailboxes")
    .select("email, display_name, signature, sort")
    .eq("ready", true)
    .order("sort");
  if (error) throw new Error(error.message);
  return (data ?? []) as Mailbox[];
}

export async function saveSignature(email: string, signature: string): Promise<void> {
  const { error } = await supabase.from("mail_mailboxes").update({ signature }).eq("email", email);
  if (error) throw new Error(error.message);
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("gmail", { body });
  // Supabase wraps non-2xx as FunctionsHttpError; dig out our JSON error.
  if (error) {
    let detail = "";
    try {
      detail = (await (error as { context?: Response }).context?.json())?.error ?? "";
    } catch { /* ignore */ }
    if (detail === "not-configured") throw new MailNotConnected(detail);
    throw new Error(detail || error.message);
  }
  if (data?.error === "not-configured") throw new MailNotConnected(data.error);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function listThreads(mailbox: string, folder: Folder, q?: string, pageToken?: string) {
  return call<{ threads: ThreadSummary[]; nextPageToken: string | null }>({ action: "list", mailbox, folder, q, pageToken });
}

export function getThread(mailbox: string, id: string) {
  return call<{ messages: MessageFull[]; subject: string }>({ action: "thread", mailbox, id });
}

export function sendMail(mailbox: string, msg: { to: string; cc?: string; subject: string; html: string; threadId?: string; inReplyTo?: string; references?: string; attachments?: Upload[]; inline?: Inline[] }) {
  return call<{ ok: true; id: string; threadId: string }>({ action: "send", mailbox, ...msg });
}

/** Mark read/unread, archive, or move back to the inbox. There is deliberately
 *  no delete: archiving keeps every mail findable in "All mail". */
export function modifyThread(mailbox: string, id: string, change: { read?: boolean; archive?: boolean; unarchive?: boolean }) {
  return call<{ ok: true }>({ action: "modify", mailbox, id, ...change });
}

/** Fetch one attachment's bytes (base64) so the browser can open or save it. */
export function getAttachment(mailbox: string, messageId: string, attachmentId: string) {
  return call<{ data: string; size: number }>({ action: "attachment", mailbox, messageId, attachmentId });
}

/** Count of unread inbox threads, for the nav badge (capped at the page size). */
export function unreadCount(mailbox: string) {
  return call<{ count: number; more: boolean }>({ action: "unread", mailbox });
}

/** The ticks on a mail we sent from here. Gmail reports nothing once a mail has
 *  gone, so this comes from our own tracking: a hidden picture for opens, our
 *  own redirect for taps, and the bounce sweep for mail that didn't arrive. */
export interface SentStatus {
  gmail_id: string | null;
  thread_id: string | null;
  sent_at: string;
  opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  click_count: number;
  bounced_at: string | null;
  bounce_reason: string | null;
}

/** Ticks for the threads on screen. `notReady` means the tracking tables
 *  haven't been added yet — the inbox still works, there are just no ticks. */
export async function sentStatus(mailbox: string, threadIds: string[]) {
  if (threadIds.length === 0) return { rows: [] as SentStatus[] };
  try {
    return await call<{ rows: SentStatus[]; notReady?: boolean }>({ action: "sent-status", mailbox, threadIds });
  } catch (e) {
    if (e instanceof MailNotConnected) throw e;
    return { rows: [] as SentStatus[], notReady: true };
  }
}

/** Look for mail that came back undelivered. Cheap enough to run when the Sent
 *  folder is opened; failures are silent because ticks are never essential. */
export async function runBounceCheck(mailbox: string) {
  try {
    return await call<{ ok: true; found: number }>({ action: "bounces", mailbox });
  } catch {
    return { ok: true as const, found: 0 };
  }
}
