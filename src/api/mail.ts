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

/** Raised when the Gmail service account hasn't been connected yet. */
export class MailNotConnected extends Error {}

export async function listMailboxes(): Promise<Mailbox[]> {
  const { data, error } = await supabase.from("mail_mailboxes").select("email, display_name, signature, sort").order("sort");
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

export function sendMail(mailbox: string, msg: { to: string; cc?: string; subject: string; html: string; threadId?: string; inReplyTo?: string; references?: string; attachments?: Upload[] }) {
  return call<{ ok: true; id: string; threadId: string }>({ action: "send", mailbox, ...msg });
}

export function modifyThread(mailbox: string, id: string, change: { read?: boolean; archive?: boolean; trash?: boolean }) {
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
