import { supabase } from "./_client";
import { whatsappDigits, type InvoiceDocument } from "../lib/invoiceTemplate";

// Invoices: creating and tracking them (the Contract & invoices tab on a client),
// and the client's page at /i/<token>. See the migration for the rules.

export interface InvoiceRow {
  id: string;
  reference: string;
  token: string;
  agent_id: string | null;
  client_name: string;
  client_phone: string;
  amount: number;
  due_date: string;
  created_at: string;
  shared_at: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  paid_at: string | null;
  voided_at: string | null;
  document: InvoiceDocument;
}

/** Thrown when the table hasn't been created yet (the SQL in
 *  supabase/migrations/20261103_0004_invoices.sql). */
export class InvoicesNotSetUp extends Error {}

const COLUMNS = "id, reference, token, agent_id, client_name, client_phone, amount, due_date, created_at, shared_at, first_opened_at, last_opened_at, open_count, paid_at, voided_at, document";

/** One client's, newest first. */
export async function listInvoices(agentId: string): Promise<InvoiceRow[]> {
  const { data, error } = await supabase.from("invoices").select(COLUMNS).eq("agent_id", agentId).order("created_at", { ascending: false }).limit(500);
  if (error) {
    if (/does not exist|schema cache|42P01|PGRST205/i.test(`${error.message} ${error.code ?? ""}`)) throw new InvoicesNotSetUp(error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as InvoiceRow[];
}

export async function createInvoice(agentId: string, document: InvoiceDocument): Promise<void> {
  const { error } = await supabase.from("invoices").insert({
    agent_id: agentId,
    client_name: document.name,
    client_phone: whatsappDigits(document.phone),
    amount: document.amount,
    due_date: document.dueDate,
    document,
  });
  if (error) {
    console.error("createInvoice failed:", error.message);
    throw new Error("Couldn't create the invoice. Try again.");
  }
}

async function setStatus(id: string, patch: Partial<Pick<InvoiceRow, "shared_at" | "paid_at" | "voided_at">>): Promise<void> {
  const { error } = await supabase.from("invoices").update(patch).eq("id", id);
  if (error) {
    console.error("invoice update failed:", error.message);
    throw new Error("That didn't save. Try again.");
  }
}

export const markInvoiceShared = (id: string) => setStatus(id, { shared_at: new Date().toISOString() });
export const markInvoicePaid = (id: string, paid: boolean) => setStatus(id, { paid_at: paid ? new Date().toISOString() : null });
export const cancelInvoice = (id: string) => setStatus(id, { voided_at: new Date().toISOString() });

export type SharedInvoice =
  | { status: "cancelled"; reference: string; staff: boolean }
  | { status: "open" | "paid"; reference: string; staff: boolean; document: InvoiceDocument };

/** The invoice behind a /i/<token> link. Null if the link isn't real. */
export async function viewInvoice(token: string): Promise<SharedInvoice | null> {
  const { data, error } = await supabase.rpc("view_invoice", { p_token: token });
  if (error) throw new Error(error.message);
  return (data as SharedInvoice | null) ?? null;
}
