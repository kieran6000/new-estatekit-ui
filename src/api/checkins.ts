import { supabase } from "./_client";
import { cleanQuestions, DEFAULT_QUESTIONS, type CheckinAnswers, type CheckinQuestion } from "../lib/checkin";

// Check-ins and the team's to-dos and notes for a client (the Check-ins tab),
// and the client's form at /k/<token>. See migrations 20261109_0001 and _0002.

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
  /** The questions it was sent with (older ones: the standard ones). */
  questions: CheckinQuestion[] | null;
}

export interface ClientNote {
  id: string;
  kind: "todo" | "note";
  /** A little HTML (see lib/richNote), or plain text for older ones. */
  body: string;
  link: string | null;
  created_at: string;
  created_by_name: string | null;
  done_at: string | null;
  done_by_name: string | null;
  /** Someone on the team it's for (they got a WhatsApp). */
  assigned_to: string | null;
  assigned_to_name: string | null;
  /** A to-do's due date, "2026-11-14". */
  due_on: string | null;
}

/** Who a to-do or note is for, and when a to-do is due. */
export interface NoteFor { assignedTo: string | null; assignedToName: string | null; dueOn: string | null }

/** The tables haven't been created yet. */
export class CheckinsNotSetUp extends Error {}
const notSetUp = (e: { message: string; code?: string }) => /relation .* does not exist|42P01|PGRST205/i.test(`${e.message} ${e.code ?? ""}`);
/** A column the database doesn't have yet (the app went out before its migration). */
const noColumn = (e: { message: string; code?: string }) => /column .* does not exist|42703|PGRST204/i.test(`${e.message} ${e.code ?? ""}`);

const ROW = "id, token, created_at, created_by_name, expires_at, shared_at, first_opened_at, answered_at, answers, comment, questions";
const QUESTIONS_KEY = "checkin_questions";

/** The questions new check-ins are sent with. */
export async function getCheckinQuestions(): Promise<CheckinQuestion[]> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", QUESTIONS_KEY).maybeSingle();
  if (!data?.value) return DEFAULT_QUESTIONS;
  try { return cleanQuestions(JSON.parse(data.value)); } catch { return DEFAULT_QUESTIONS; }
}

export async function saveCheckinQuestions(questions: CheckinQuestion[]): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert({ key: QUESTIONS_KEY, value: JSON.stringify(cleanQuestions(questions)), updated_at: new Date().toISOString() });
  if (error) {
    console.error("saveCheckinQuestions failed:", error.message);
    throw new Error("Couldn't save the questions. Try again.");
  }
}

const REVIEW_KEY = "google_review_link";

/** Where very happy clients are asked to leave a Google review ("" = don't ask). */
export async function getReviewLink(): Promise<string> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", REVIEW_KEY).maybeSingle();
  return data?.value?.trim() ?? "";
}

export async function saveReviewLink(link: string): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert({ key: REVIEW_KEY, value: link.trim(), updated_at: new Date().toISOString() });
  if (error) {
    console.error("saveReviewLink failed:", error.message);
    throw new Error("Couldn't save the review link. Try again.");
  }
}

export async function listCheckins(agentId: string): Promise<CheckinRow[]> {
  const { data, error } = await supabase.from("client_checkins").select(ROW).eq("agent_id", agentId).order("created_at", { ascending: false }).limit(200);
  if (error) {
    if (notSetUp(error)) throw new CheckinsNotSetUp(error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as CheckinRow[];
}

/** A link, not sent yet: it only counts as sent once someone says so. */
export async function createCheckin(agentId: string, fromName: string): Promise<CheckinRow> {
  const questions = await getCheckinQuestions();
  const { data, error } = await supabase.from("client_checkins").insert({ agent_id: agentId, created_by_name: fromName || null, questions }).select(ROW).single();
  if (error) {
    console.error("createCheckin failed:", error.message);
    throw new Error("Couldn't make the check-in link. Try again.");
  }
  return data as CheckinRow;
}

export async function markCheckinSent(id: string, sent: boolean): Promise<void> {
  const { error } = await supabase.from("client_checkins").update({ shared_at: sent ? new Date().toISOString() : null }).eq("id", id);
  if (error) {
    console.error("markCheckinSent failed:", error.message);
    throw new Error("Couldn't save that. Try again.");
  }
}

const NOTE_COLS = "id, kind, body, link, created_at, created_by_name, done_at, done_by_name";

export async function listClientNotes(agentId: string): Promise<ClientNote[]> {
  const query = (cols: string) => supabase.from("client_notes").select(cols).eq("agent_id", agentId).order("created_at", { ascending: false }).limit(500);
  let { data, error } = await query(`${NOTE_COLS}, assigned_to, assigned_to_name, due_on`);
  // Before the "for" and "due" columns exist: the to-dos without them.
  if (error && noColumn(error)) {
    ({ data, error } = await query(NOTE_COLS));
    if (!error) return ((data ?? []) as unknown as ClientNote[]).map((n) => ({ ...n, assigned_to: null, assigned_to_name: null, due_on: null }));
  }
  if (error) {
    if (notSetUp(error)) throw new CheckinsNotSetUp(error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as unknown as ClientNote[];
}

/** A to-do or note about a check-in keeps that check-in's address in its
 *  link (the notes table only takes https links). */
export const checkinLink = (agentId: string, checkinId: string) => `https://leads.estatekit.co/clients/${agentId}/checkins#checkin-${checkinId}`;
export const checkinIdOf = (link: string | null | undefined) => link?.match(/#checkin-([0-9a-f-]{36})$/i)?.[1] ?? null;

const forCols = (f: NoteFor, kind: "todo" | "note", clearing = false) => {
  const due = kind === "todo" ? f.dueOn : null;
  if (!clearing && !f.assignedTo && !due) return {};
  return { assigned_to: f.assignedTo, assigned_to_name: f.assignedTo ? f.assignedToName : null, due_on: due };
};

/** Saves it; returns its id. */
export async function addClientNote(agentId: string, kind: "todo" | "note", body: string, byName: string, link: string | null = null, f: NoteFor = { assignedTo: null, assignedToName: null, dueOn: null }): Promise<string> {
  const { data, error } = await supabase.from("client_notes").insert({ agent_id: agentId, kind, body, link, created_by_name: byName || null, ...forCols(f, kind) }).select("id").single();
  if (error || !data) {
    console.error("addClientNote failed:", error?.message);
    throw new Error("Couldn't save that. Try again.");
  }
  return data.id as string;
}

/** `had`: it was for someone or had a due date (so clearing them is saved). */
export async function updateClientNote(id: string, body: string, kind: "todo" | "note", f: NoteFor, had = false): Promise<void> {
  const { error } = await supabase.from("client_notes").update({ body, ...forCols(f, kind, had) }).eq("id", id);
  if (error) {
    console.error("updateClientNote failed:", error.message);
    throw new Error("Couldn't save that. Try again.");
  }
}

/** WhatsApp the person it's for, from the business number. Once per person:
 *  the server skips it if they've already been told. False if it didn't go. */
export async function pingNote(id: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("note-ping", { body: { id } });
  if (error) {
    console.error("note-ping failed:", error.message);
    return false;
  }
  return data?.sent === true || data?.reason === "nothing to send";
}

/** The team (EstateKit staff): who a to-do can be for. */
export async function listTeam(): Promise<{ agent_id: string; name: string }[]> {
  const { data, error } = await supabase.from("agent_profiles").select("agent_id, display_name").eq("is_operator", true).order("display_name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ agent_id: p.agent_id as string, name: ((p.display_name as string | null) ?? "").trim().split(/\s+/)[0] || "Someone" }));
}

export interface MyTodo { id: string; agent_id: string; due_on: string | null }

/** Open to-dos for the signed-in person, on every client: the red counts. */
export async function listMyTodos(uid: string): Promise<MyTodo[]> {
  const { data, error } = await supabase.from("client_notes").select("id, agent_id, due_on")
    .eq("assigned_to", uid).eq("kind", "todo").is("done_at", null).limit(500);
  if (error) return [];
  return (data ?? []) as MyTodo[];
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

export interface SharedCheckin { first_name: string; agent_id: string; status: "open" | "answered" | "expired"; questions?: CheckinQuestion[]; review_link?: string | null }

export async function getCheckin(token: string): Promise<SharedCheckin | null> {
  const { data, error } = await supabase.rpc("get_checkin", { p_token: token });
  if (error) throw new Error(error.message);
  return (data as SharedCheckin | null) ?? null;
}

export async function submitCheckin(token: string, answers: CheckinAnswers): Promise<"ok" | "answered" | "expired" | "invalid" | "incomplete"> {
  const { data, error } = await supabase.rpc("submit_checkin", { p_token: token, p_answers: answers, p_comment: "" });
  if (error) throw new Error(error.message);
  return data as "ok" | "answered" | "expired" | "invalid" | "incomplete";
}
