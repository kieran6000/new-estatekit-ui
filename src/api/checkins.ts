import { supabase } from "./_client";
import type { CheckinAnswers } from "../lib/checkin";

// Check-ins and the team's to-dos and notes for a client (the Check-ins tab),
// and the client's form at /k/<token>. See migration 20261109_0001.

export interface CheckinRow {
  id: string;
  token: string;
  created_at: string;
  created_by_name: string | null;
  expires_at: string;
  shared_at: string | null;
  first_opened_at: string | null;
  answered_at: string | null;
  answers: CheckinAnswers | null;
  comment: string | null;
}

export interface ClientNote {
  id: string;
  kind: "todo" | "note";
  body: string;
  link: string | null;
  created_at: string;
  created_by_name: string | null;
  done_at: string | null;
  done_by_name: string | null;
}

/** The tables haven't been created yet. */
export class CheckinsNotSetUp extends Error {}
const notSetUp = (e: { message: string; code?: string }) => /does not exist|schema cache|42P01|PGRST205/i.test(`${e.message} ${e.code ?? ""}`);

export async function listCheckins(agentId: string): Promise<CheckinRow[]> {
  const { data, error } = await supabase.from("client_checkins")
    .select("id, token, created_at, created_by_name, expires_at, shared_at, first_opened_at, answered_at, answers, comment")
    .eq("agent_id", agentId).order("created_at", { ascending: false }).limit(200);
  if (error) {
    if (notSetUp(error)) throw new CheckinsNotSetUp(error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as CheckinRow[];
}

export async function createCheckin(agentId: string, fromName: string): Promise<CheckinRow> {
  const { data, error } = await supabase.from("client_checkins")
    .insert({ agent_id: agentId, created_by_name: fromName || null })
    .select("id, token, created_at, created_by_name, expires_at, shared_at, first_opened_at, answered_at, answers, comment").single();
  if (error) {
    console.error("createCheckin failed:", error.message);
    throw new Error("Couldn't make the check-in link. Try again.");
  }
  return data as CheckinRow;
}

export async function markCheckinShared(id: string): Promise<void> {
  const { error } = await supabase.from("client_checkins").update({ shared_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error("markCheckinShared failed:", error.message);
}

export async function deleteCheckin(id: string): Promise<void> {
  const { error } = await supabase.from("client_checkins").delete().eq("id", id);
  if (error) {
    console.error("deleteCheckin failed:", error.message);
    throw new Error("Couldn't remove it. Try again.");
  }
}

export async function listClientNotes(agentId: string): Promise<ClientNote[]> {
  const { data, error } = await supabase.from("client_notes")
    .select("id, kind, body, link, created_at, created_by_name, done_at, done_by_name")
    .eq("agent_id", agentId).order("created_at", { ascending: false }).limit(500);
  if (error) {
    if (notSetUp(error)) throw new CheckinsNotSetUp(error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as ClientNote[];
}

export async function addClientNote(agentId: string, kind: "todo" | "note", body: string, link: string | null, byName: string): Promise<void> {
  const { error } = await supabase.from("client_notes").insert({ agent_id: agentId, kind, body: body.trim(), link: link || null, created_by_name: byName || null });
  if (error) {
    console.error("addClientNote failed:", error.message);
    throw new Error("Couldn't save that. Try again.");
  }
}

export async function setNoteDone(id: string, done: boolean, byName: string): Promise<void> {
  const { error } = await supabase.from("client_notes").update(done ? { done_at: new Date().toISOString(), done_by_name: byName || null } : { done_at: null, done_by_name: null }).eq("id", id);
  if (error) {
    console.error("setNoteDone failed:", error.message);
    throw new Error("Couldn't save that. Try again.");
  }
}

export async function deleteClientNote(id: string): Promise<void> {
  const { error } = await supabase.from("client_notes").delete().eq("id", id);
  if (error) {
    console.error("deleteClientNote failed:", error.message);
    throw new Error("Couldn't remove it. Try again.");
  }
}

/* ── The client's form ── */

export interface SharedCheckin { first_name: string; agent_id: string; status: "open" | "answered" | "expired" }

export async function getCheckin(token: string): Promise<SharedCheckin | null> {
  const { data, error } = await supabase.rpc("get_checkin", { p_token: token });
  if (error) throw new Error(error.message);
  return (data as SharedCheckin | null) ?? null;
}

export async function submitCheckin(token: string, answers: CheckinAnswers, comment: string): Promise<"ok" | "answered" | "expired" | "invalid" | "incomplete"> {
  const { data, error } = await supabase.rpc("submit_checkin", { p_token: token, p_answers: answers, p_comment: comment });
  if (error) throw new Error(error.message);
  return data as "ok" | "answered" | "expired" | "invalid" | "incomplete";
}
