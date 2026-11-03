import { supabase } from "./_client";
import type { ContractDocument } from "../lib/contractTemplate";

// Contracts: creating and tracking them (Accounts → Contracts, and the
// Contract tab on a client), and the client's page at /c/<token>. The contract
// edge function does all the writing; see its header for the rules.

export interface ContractRow {
  id: string;
  reference: string;
  token: string;
  agent_id: string | null;
  title: string;
  signer_name: string;
  signer_company: string | null;
  signer_phone: string;
  created_by_name: string | null;
  created_at: string;
  shared_at: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  seconds_read: number;
  max_scroll: number;
  read_to_end_at: string | null;
  signed_at: string | null;
  signed_name: string | null;
  voided_at: string | null;
}

export interface ContractEvent {
  id: string;
  type: string;
  at: string;
  actor: string | null;
  ip: string | null;
  user_agent: string | null;
}

/** Thrown when the table hasn't been created yet (the SQL in
 *  supabase/migrations/20261103_0002_contracts.sql). */
export class ContractsNotSetUp extends Error {}

const COLUMNS = "id, reference, token, agent_id, title, signer_name, signer_company, signer_phone, created_by_name, created_at, shared_at, first_opened_at, last_opened_at, open_count, seconds_read, max_scroll, read_to_end_at, signed_at, signed_name, voided_at";

/** Newest first: one client's, or everyone's. */
export async function listContracts(agentId?: string): Promise<ContractRow[]> {
  let q = supabase.from("contracts").select(COLUMNS).order("created_at", { ascending: false }).limit(500);
  if (agentId) q = q.eq("agent_id", agentId);
  const { data, error } = await q;
  if (error) {
    if (/does not exist|schema cache|42P01|PGRST205/i.test(`${error.message} ${error.code ?? ""}`)) throw new ContractsNotSetUp(error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as ContractRow[];
}

export async function listContractEvents(contractId: string): Promise<ContractEvent[]> {
  const { data, error } = await supabase.from("contract_events").select("id, type, at, actor, ip, user_agent").eq("contract_id", contractId).order("at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as ContractEvent[];
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("contract", { body });
  if (error) {
    // supabase-js hides the JSON body of a non-2xx answer in error.context.
    const ctx = (error as { context?: Response }).context;
    const answer = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new Error(answer?.error ? String(answer.error) : "That didn't go through. Check your signal and try again.");
  }
  return data as T;
}

export const createContract = (c: { agentId: string | null; title: string; signerName: string; company: string; phone: string; email: string; document: ContractDocument }) =>
  call<{ id: string; reference: string }>({ action: "create", ...c });
export const markContractShared = (id: string, how: "whatsapp" | "copied") => call<void>({ action: "shared", id, how });
export const cancelContract = (id: string) => call<void>({ action: "void", id });
export const getMySignature = () => call<{ signature: string | null; canChange: boolean }>({ action: "my_signature" });
export const saveMySignature = (signature: string) => call<void>({ action: "save_signature", signature });

export interface SignedRecord {
  at: string;
  name: string;
  initials: string | null;
  signature: string;
  maskedPhone: string;
  ip: string | null;
  userAgent: string | null;
}

export type SharedContract =
  | { status: "cancelled"; reference: string; title: string; staff: boolean }
  | {
    status: "open" | "signed";
    staff: boolean;
    reference: string;
    title: string;
    document: ContractDocument;
    documentHash: string;
    issuedBy: string | null;
    issuedAt: string;
    signerName: string;
    maskedPhone: string;
    signed: SignedRecord | null;
  };

/** The contract behind a /c/<token> link. Null if the link isn't real. */
export async function viewContract(token: string, session: string): Promise<SharedContract | null> {
  try {
    return await call<SharedContract>({ action: "view", token, session });
  } catch (e) {
    if ((e as Error).message === "not_found") return null;
    throw e;
  }
}

export const signContract = (s: { token: string; session: string; name: string; signature: string; initials: string }) =>
  call<void>({ action: "sign", agreed: true, ...s });

/** Reading time and how far they got. keepalive lets it leave as the page closes. */
export function reportReading(token: string, session: string, seconds: number, scroll: number): void {
  fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract`, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ action: "beat", token, session, seconds, scroll }),
  }).catch(() => {});
}

/** Where a contract has got to, furthest first. */
export function contractStatus(c: ContractRow): { label: string; tone: "green" | "blue" | "amber" | "grey" | "red" } {
  if (c.signed_at) return { label: "Signed", tone: "green" };
  if (c.voided_at) return { label: "Cancelled", tone: "red" };
  if (c.read_to_end_at) return { label: "Reached the end, not signed", tone: "amber" };
  if (c.first_opened_at) return { label: "Opened, not signed", tone: "amber" };
  if (c.shared_at) return { label: "Sent, not opened", tone: "blue" };
  return { label: "Not sent yet", tone: "grey" };
}

export function readingTime(seconds: number): string {
  if (seconds < 60) return seconds ? `${seconds} sec` : "None yet";
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`;
}

/** "iPhone" or "Windows computer, Chrome": enough to tell devices apart. */
export function deviceName(ua: string | null): string {
  if (!ua) return "Unknown device";
  const device = /iphone/i.test(ua) ? "iPhone" : /ipad/i.test(ua) ? "iPad" : /android/i.test(ua) ? "Android phone" : /windows/i.test(ua) ? "Windows computer" : /macintosh/i.test(ua) ? "Mac" : "Other device";
  const browser = /edg\//i.test(ua) ? "Edge" : /samsungbrowser/i.test(ua) ? "Samsung Internet" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "";
  return browser ? `${device}, ${browser}` : device;
}
