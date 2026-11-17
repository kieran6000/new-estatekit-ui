import type { Inline, Upload } from "../api/mail";

// The email you're busy writing.
//
// It lives here, outside any one page, so it behaves the way Gmail's does:
// shrink it to a small bar in the bottom corner, walk off to Clients or Leads,
// and it's still there — same words, same attachments — ready to carry on.
//
// Deliberately not React context: the Mail page and the app shell both reach
// for it, and a plain subscription keeps the heavy compose window out of every
// other page's download.

export interface Draft {
  to: string; cc: string; subject: string; body: string;
  threadId?: string; inReplyTo?: string; references?: string; quoted?: string;
  attachments?: Upload[]; inline?: Inline[];
  /** Set on a reply/forward so the window can say plainly what it answers. */
  replyTo?: { name: string; email: string; subject: string };
  /** True when the body is already html (a restored draft), not plain text. */
  rich?: boolean;
  hadFiles?: boolean;
}

export interface ComposeState {
  /** What's being written. null = nothing open. */
  draft: Draft | null;
  /** Shrunk to the bar in the corner. */
  minimized: boolean;
  /** Which mailbox it goes out from. */
  mailbox: string | null;
}

let state: ComposeState = { draft: null, minimized: false, mailbox: null };
const subs = new Set<() => void>();

function set(next: ComposeState) {
  state = next;
  subs.forEach((f) => f());
}

export function getCompose(): ComposeState {
  return state;
}

export function subscribeCompose(cb: () => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

/** Open a new email (or put a half-written one back on screen). */
export function openCompose(draft: Draft, mailbox?: string | null): void {
  set({ draft, minimized: false, mailbox: mailbox ?? state.mailbox });
}

/** Shrink it to the bar in the corner — nothing is lost. */
export function minimizeCompose(): void {
  if (state.draft && !state.minimized) set({ ...state, minimized: true });
}

/** Keep what's typed as it changes, so a minimised bar shows the right words. */
export function updateCompose(draft: Draft): void {
  if (state.draft) set({ ...state, draft });
}

/** Close the window. The draft stays saved; only sending or throwing it away
 *  gets rid of it. */
export function closeCompose(): void {
  set({ draft: null, minimized: false, mailbox: state.mailbox });
}
