// The unfinished email.
//
// Compose saves what you've typed as you type, so switching tabs, opening a
// client, or closing the browser never loses it. The compose window shrinks
// to a small bar in the bottom corner (see MailComposeHost) and follows you
// from page to page, so a half-written email is never lost.
//
// Attachments are deliberately NOT stored: file bytes would blow past the
// localStorage limit and silently drop the whole draft. The restore banner says
// so out loud instead of pretending the files are still there.

const KEY = "ek.mail.draft";
const EVT = "ek-mail-draft";

export interface StoredDraft {
  mailbox: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  quoted?: string;
  /** Who/what this is a reply to, so Compose can say it plainly. */
  replyTo?: { name: string; email: string; subject: string };
  hadFiles?: boolean;
  savedAt: number;
}

/** Empty = nothing typed yet, so it isn't worth keeping. */
export function isEmptyDraft(d: Pick<StoredDraft, "to" | "cc" | "subject" | "body">): boolean {
  const text = d.body.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return !d.to.trim() && !d.cc.trim() && !d.subject.trim() && !text;
}

export function getDraft(): StoredDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as StoredDraft;
    if (!d || typeof d.body !== "string") return null;
    return d;
  } catch {
    return null;
  }
}

export function saveDraft(d: Omit<StoredDraft, "savedAt">): void {
  try {
    if (isEmptyDraft(d)) { clearDraft(); return; }
    localStorage.setItem(KEY, JSON.stringify({ ...d, savedAt: Date.now() }));
  } catch {
    /* storage full or blocked — the in-memory draft still works */
  }
  window.dispatchEvent(new Event(EVT));
}

export function clearDraft(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT));
}

/** Fires on our own saves and on changes made in another tab. */
export function subscribeDraft(cb: () => void): () => void {
  const onStore = (e: StorageEvent) => { if (!e.key || e.key === KEY) cb(); };
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", onStore);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", onStore);
  };
}

/** What the pill says: "Re: offer — to Jan" style, never blank. */
export function draftLabel(d: StoredDraft): string {
  const subject = d.subject.trim();
  const to = d.to.split(",")[0]?.trim();
  if (subject && to) return `${subject} — to ${to}`;
  if (subject) return subject;
  if (to) return `To ${to}`;
  const text = d.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 48) : "Unfinished email";
}
