import { useEffect } from "react";
import { supabase } from "../api/_client";

// A seller's form must never be lost.
//
// The thank-you page shows straight away (the pixel fires there) while the lead
// saves in the background. That save used to be tried once, and a failure was
// dropped in silence: on a patchy phone signal the seller saw "thank you",
// Meta counted a conversion, and the agent never got the lead.
//
// Now each form is kept on the phone until it's saved: a few quick retries,
// then again when the signal comes back or the next time the page opens.
//
// Sending twice is safe: the server treats the same number within 10 minutes
// as the same lead and changes nothing (merge_repeat_lead), and the quick
// retries all fall well inside that window.

const KEY = "ek-lead-outbox";
/** Waits before the 2nd, 3rd and 4th try: about 20 seconds in all. */
const RETRY_MS = [2000, 5000, 12000];
/** Kept this long for a later try, then given up. */
const KEEP_MS = 24 * 3600_000;

export interface LeadSubmission {
  pageId: string;
  name: string;
  phone: string;
  formAnswers: { q: string; a: string }[];
  email: string | null;
  attribution: Record<string, string | undefined>;
  quality: "good" | "weak";
  planToken: string | null;
}

interface Entry {
  id: string;
  at: number;
  body: LeadSubmission;
}

function read(): Entry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(list: Entry[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode): the retries in this visit still run.
  }
}
const remember = (e: Entry) => write([...read().filter((x) => x.id !== e.id), e]);
const forget = (id: string) => write(read().filter((x) => x.id !== id));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The server looked at it and said no (a bad request): another try can't help. */
class Refused extends Error {}

async function sendOnce(body: LeadSubmission): Promise<{ id: string } | null> {
  const { data, error } = await supabase.functions.invoke("public-submit-lead", { body });
  if (!error) return (data as { id: string } | null) ?? null;
  const status = (error as { context?: { status?: number } }).context?.status;
  if (error.name === "FunctionsHttpError" && status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    throw new Refused(error.message);
  }
  throw error; // No signal, a timeout or a server hiccup: worth another try.
}

const sending = new Set<string>();

async function deliver(entry: Entry, waits: number[]): Promise<{ id: string } | null> {
  if (sending.has(entry.id)) return null;
  sending.add(entry.id);
  try {
    let last: unknown;
    for (let i = 0; i <= waits.length; i++) {
      if (i) await sleep(waits[i - 1]);
      try {
        const res = await sendOnce(entry.body);
        forget(entry.id);
        return res;
      } catch (e) {
        last = e;
        if (e instanceof Refused) {
          forget(entry.id);
          throw e;
        }
      }
    }
    throw last; // Still kept: sent again when the signal is back or the page reopens.
  } finally {
    sending.delete(entry.id);
  }
}

/** Save a seller's form: kept on the phone until the server has it. */
export function submitLead(body: LeadSubmission): Promise<{ id: string } | null> {
  const entry: Entry = { id: crypto.randomUUID(), at: Date.now(), body };
  remember(entry);
  return deliver(entry, RETRY_MS);
}

/** Send any form still waiting from earlier (one try each). */
export function flushLeadOutbox(): void {
  const now = Date.now();
  const list = read();
  const fresh = list.filter((e) => now - e.at < KEEP_MS);
  if (fresh.length !== list.length) write(fresh);
  for (const e of fresh) void deliver(e, []).catch(() => {});
}

/** On the lead and thank-you pages: send anything waiting now, and again
 *  whenever the phone gets its signal back. */
export function useLeadOutbox(): void {
  useEffect(() => {
    flushLeadOutbox();
    window.addEventListener("online", flushLeadOutbox);
    return () => window.removeEventListener("online", flushLeadOutbox);
  }, []);
}
