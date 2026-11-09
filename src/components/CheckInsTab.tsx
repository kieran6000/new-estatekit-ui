import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { listAgentProfiles } from "../api/_client";
import {
  addClientNote, CheckinsNotSetUp, createCheckin, deleteClientNote, getCheckinQuestions, listCheckins, listClientNotes,
  markCheckinSent, saveCheckinQuestions, setNoteDone, updateClientNote, type CheckinRow, type ClientNote,
} from "../api/checkins";
import { useAuth } from "../hooks/useAuth";
import { useSnack } from "../hooks/useSnack";
import { checkinMessage, checkinState, cleanQuestions, daysAgo, DEFAULT_QUESTIONS, newQuestionId, scoreCheckin, whatTheySaid, type CheckinQuestion, type Risk } from "../lib/checkin";
import { waDigits } from "../lib/phone";
import { isEmptyNote, noteForSaving } from "../lib/richNote";
import { tokens } from "../theme";
import { NoteEditor, NoteView } from "./RichNote";

// The client's Check-ins tab: how they're feeling, sending a check-in, and what
// the team has to do for them. Clients answer when they answer, so it shows
// what happened and when, not a schedule they've fallen behind on.

const RISK_COLOR: Record<Risk, string> = { green: tokens.green, amber: tokens.amber, red: tokens.red };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short" });
const scoreColor = (n: number) => (n <= 2 ? tokens.red : n === 3 ? tokens.amber : tokens.green);
const linkFor = (c: CheckinRow) => `${window.location.origin}/k/${c.token}`;
const questionsOf = (r: CheckinRow) => cleanQuestions(r.questions ?? DEFAULT_QUESTIONS);

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", minWidth: 0 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 0.5, minHeight: 40, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: 1 }}>{title}</Typography>
        {action}
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>{children}</Box>
    </Box>
  );
}

const Dot = ({ risk, size = 10 }: { risk: Risk; size?: number }) => <Box component="span" sx={{ display: "inline-block", width: size, height: size, borderRadius: "50%", bgcolor: RISK_COLOR[risk], flex: "none" }} />;

/** One 1–5 answer as five boxes, so a 2 looks like a 2 from across the room. */
function Score({ n }: { n: number }) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: "3px" }} aria-label={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Box key={i} sx={{ width: 14, height: 14, borderRadius: "3px", bgcolor: i <= n ? scoreColor(n) : tokens.surface2 }} />)}
      <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 700, ml: 0.75, fontVariantNumeric: "tabular-nums" }}>{n}</Typography>
    </Box>
  );
}

/** Sending: open WhatsApp or copy, then say it went. Nothing counts as sent until then. */
function SendBox({ agentId, clientName, clientPhone, rows, fromName }: { agentId: string; clientName: string; clientPhone: string | null; rows: CheckinRow[]; fromName: string }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [busy, setBusy] = useState(false);
  const state = checkinState(rows);
  const first = clientName.trim().split(/\s+/)[0] ?? "";
  const phone = waDigits(clientPhone);
  const refresh = () => qc.invalidateQueries({ queryKey: ["checkins", agentId] });

  async function link(): Promise<CheckinRow> {
    if (state.waiting) return state.waiting;
    if (state.draft) return state.draft;
    const c = await createCheckin(agentId, fromName);
    await refresh();
    return c;
  }
  async function openWhatsApp() {
    setBusy(true);
    const win = window.open("about:blank", "_blank"); // opened now: a phone blocks one opened after waiting
    try {
      const c = await link();
      if (win) win.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(checkinMessage(first, fromName, linkFor(c)))}`;
    } catch (e) {
      win?.close();
      showSnack((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    setBusy(true);
    try {
      const c = await link();
      await navigator.clipboard.writeText(checkinMessage(first, fromName, linkFor(c)));
      showSnack("Copied. Paste it in their WhatsApp chat.");
    } catch (e) {
      showSnack(e instanceof Error && !/clipboard|document/i.test(e.message) ? e.message : "Couldn't copy it. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function markSent(id: string, sent: boolean) {
    try { await markCheckinSent(id, sent); await refresh(); } catch (e) { showSnack((e as Error).message); }
  }

  if (state.waiting) {
    return (
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, p: 1.25, borderRadius: "8px", bgcolor: tokens.surface2 }}>
        <Typography sx={{ fontSize: 14.5, flex: "1 1 200px" }}>Sent {daysAgo(state.waiting.shared_at!)}, no answer yet.</Typography>
        <Button size="small" startIcon={<ContentCopyIcon />} onClick={copy} disabled={busy}>Copy again</Button>
        <Button size="small" onClick={() => markSent(state.waiting!.id, false)}>Wasn't sent</Button>
      </Box>
    );
  }
  return (
    <Box sx={{ p: 1.25, borderRadius: "8px", bgcolor: tokens.surface2 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {phone && <Button variant="contained" disableElevation startIcon={<WhatsAppIcon />} onClick={openWhatsApp} disabled={busy} sx={{ minHeight: 42 }}>Send a check-in</Button>}
        <Button variant={phone ? "outlined" : "contained"} disableElevation startIcon={<ContentCopyIcon />} onClick={copy} disabled={busy} sx={{ minHeight: 42 }}>Copy message</Button>
      </Box>
      {state.draft && (
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mt: 1.25 }}>
          <Typography sx={{ fontSize: 14 }}>Sent it to them?</Typography>
          <Button size="small" variant="outlined" onClick={() => markSent(state.draft!.id, true)}>Yes, mark as sent</Button>
        </Box>
      )}
      {!phone && <Typography sx={{ fontSize: 13, color: tokens.ink2, mt: 1 }}>They have no WhatsApp number on file, so copy the message and send it yourself.</Typography>}
    </Box>
  );
}

function EditQuestions({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const { data: saved } = useQuery({ queryKey: ["checkinQuestions"], queryFn: getCheckinQuestions });
  const [qs, setQs] = useState<CheckinQuestion[] | null>(null);
  const list = qs ?? saved ?? DEFAULT_QUESTIONS;
  const set = (i: number, patch: Partial<CheckinQuestion>) => setQs(list.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, by: number) => { const next = [...list]; const [q] = next.splice(i, 1); next.splice(i + by, 0, q); setQs(next); };
  const ok = list.some((q) => q.type === "rating") && list.every((q) => q.label.trim());
  async function save() {
    try {
      await saveCheckinQuestions(list.map((q) => ({ ...q, short: q.short.trim() || q.label.trim() })));
      await qc.invalidateQueries({ queryKey: ["checkinQuestions"] });
      showSnack("Saved. New check-ins use these questions.");
      onClose();
    } catch (e) {
      showSnack((e as Error).message);
    }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Check-in questions</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 14, color: tokens.ink2, mb: 2 }}>For every client. Check-ins already sent keep the questions they went out with, so old answers still make sense.</Typography>
        {list.map((q, i) => (
          <Box key={q.id} sx={{ py: 1.5, borderTop: `1px solid ${tokens.divider2}`, display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 2fr) minmax(0, 1fr) 150px auto" }, gap: 1, alignItems: "start" }}>
            <TextField size="small" label="Question" value={q.label} onChange={(e) => set(i, { label: e.target.value })} />
            <TextField size="small" label="Short name" value={q.short} onChange={(e) => set(i, { short: e.target.value })} helperText="Shown on the tab" />
            <TextField size="small" select label="Answer" value={q.type} onChange={(e) => set(i, e.target.value === "text" ? { type: "text", low: undefined, high: undefined } : { type: "rating", low: q.low || "Poor", high: q.high || "Great" })}>
              <MenuItem value="rating">1 to 5</MenuItem>
              <MenuItem value="text">Written (optional)</MenuItem>
            </TextField>
            <Box sx={{ display: "flex" }}>
              <IconButton size="small" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton>
              <IconButton size="small" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton>
              <IconButton size="small" aria-label="Remove question" onClick={() => setQs(list.filter((_, j) => j !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton>
            </Box>
            {q.type === "rating" && (
              <Box sx={{ display: "flex", gap: 1, gridColumn: { md: "1 / 3" } }}>
                <TextField size="small" label="1 means" value={q.low ?? ""} onChange={(e) => set(i, { low: e.target.value })} sx={{ flex: 1 }} />
                <TextField size="small" label="5 means" value={q.high ?? ""} onChange={(e) => set(i, { high: e.target.value })} sx={{ flex: 1 }} />
              </Box>
            )}
          </Box>
        ))}
        <Button onClick={() => setQs([...list, { id: newQuestionId(), type: "rating", label: "", short: "", low: "Poor", high: "Great" }])} sx={{ mt: 1 }}>Add a question</Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disableElevation disabled={!ok} onClick={save}>Save questions</Button>
      </DialogActions>
    </Dialog>
  );
}

function HowTheyFeel({ agentId, clientName, clientPhone, fromName }: { agentId: string; clientName: string; clientPhone: string | null; fromName: string }) {
  const [editing, setEditing] = useState(false);
  const { data: rows = [], isLoading, error } = useQuery({ queryKey: ["checkins", agentId], queryFn: () => listCheckins(agentId), retry: (n, e) => !(e instanceof CheckinsNotSetUp) && n < 1 });
  const answered = rows.filter((r) => r.answered_at && r.answers);
  const latest = answered[0];
  const latestQs = latest ? questionsOf(latest) : [];
  const s = latest ? scoreCheckin(latest.answers!, latestQs) : null;
  const state = checkinState(rows);
  const trend = answered.slice(0, 8).reverse();

  if (error) return <Card title="How they're feeling"><Typography sx={{ fontSize: 14, color: tokens.ink2 }}>{error instanceof CheckinsNotSetUp ? "Check-ins aren't switched on yet." : "Couldn't load their check-ins. Refresh to try again."}</Typography></Card>;
  return (
    <Card title="How they're feeling" action={<Button size="small" onClick={() => setEditing(true)} sx={{ my: -0.5 }}>Edit questions</Button>}>
      {editing && <EditQuestions onClose={() => setEditing(false)} />}
      {isLoading ? null : (
        <>
          {latest && s ? (
            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 1.5, rowGap: 0.5 }}>
              <Dot risk={s.risk} size={12} />
              <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{s.average}<Box component="span" sx={{ fontSize: 15, fontWeight: 400, color: tokens.ink2 }}> of 5</Box></Typography>
              {s.risk === "red" && <Typography sx={{ fontSize: 14, fontWeight: 700, color: tokens.red }}>At risk</Typography>}
              <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>answered {daysAgo(latest.answered_at!)}</Typography>
              {trend.length > 1 && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, ml: { sm: "auto" } }}>
                  {trend.map((r) => {
                    const t = scoreCheckin(r.answers!, questionsOf(r));
                    return <Tooltip key={r.id} title={`${day(r.answered_at!)}: ${t.average} of 5`}><Box><Dot risk={t.risk} /></Box></Tooltip>;
                  })}
                </Box>
              )}
            </Box>
          ) : (
            <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>No answers yet.</Typography>
          )}
          <Typography sx={{ fontSize: 13, color: tokens.ink2, mt: 0.5, mb: 1.5 }}>
            {state.sentCount ? `Answered ${state.answeredCount} of ${state.sentCount} sent` : "None sent yet"}
            {state.lastSent ? ` · last sent ${daysAgo(state.lastSent.shared_at!)}` : ""}
          </Typography>

          <SendBox agentId={agentId} clientName={clientName} clientPhone={clientPhone} rows={rows} fromName={fromName} />

          {latest && s && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, columnGap: 3, rowGap: 1 }}>
                {latestQs.filter((q) => q.type === "rating" && typeof latest.answers![q.id] === "number").map((q) => (
                  <Box key={q.id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, py: 0.5, borderBottom: `1px solid ${tokens.divider2}` }}>
                    <Typography sx={{ fontSize: 14, fontWeight: s.weak.includes(q.id) ? 600 : 400 }}>{q.short}</Typography>
                    <Score n={latest.answers![q.id] as number} />
                  </Box>
                ))}
              </Box>
              {whatTheySaid(latest.answers, latestQs, latest.comment) && (
                <Box sx={{ mt: 1.5, p: 1.25, borderRadius: "6px", bgcolor: tokens.surface2, borderLeft: `3px solid ${tokens.ink3}` }}>
                  <Typography sx={{ fontSize: 12.5, color: tokens.ink2, mb: 0.25 }}>What they said</Typography>
                  <Typography sx={{ fontSize: 15, whiteSpace: "pre-wrap" }}>{whatTheySaid(latest.answers, latestQs, latest.comment)}</Typography>
                </Box>
              )}
            </Box>
          )}

          {answered.length > 1 && (
            <Box sx={{ mt: 2.5 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, mb: 0.75 }}>Earlier answers</Typography>
              {answered.slice(1).map((r) => {
                const qs = questionsOf(r);
                const t = scoreCheckin(r.answers!, qs);
                const said = whatTheySaid(r.answers, qs, r.comment);
                return (
                  <Box key={r.id} sx={{ py: 1, borderTop: `1px solid ${tokens.divider2}` }}>
                    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 1.25, rowGap: 0.5 }}>
                      <Dot risk={t.risk} />
                      <Typography sx={{ fontSize: 14, fontWeight: 600, minWidth: 100 }}>{day(r.answered_at!)}</Typography>
                      <Typography sx={{ fontSize: 13.5 }}>{t.average} of 5</Typography>
                      <Typography sx={{ fontSize: 13, color: tokens.ink2 }}>{qs.filter((q) => q.type === "rating" && typeof r.answers![q.id] === "number").map((q) => `${q.short} ${r.answers![q.id]}`).join(" · ")}</Typography>
                    </Box>
                    {said && <Typography sx={{ fontSize: 13.5, color: tokens.ink2, mt: 0.25, whiteSpace: "pre-wrap" }}>"{said}"</Typography>}
                  </Box>
                );
              })}
            </Box>
          )}
        </>
      )}
    </Card>
  );
}

function NoteRow({ n, agentId, byName }: { n: ClientNote; agentId: string; byName: string }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const run = async (work: Promise<void>) => {
    try { await work; await qc.invalidateQueries({ queryKey: ["clientNotes", agentId] }); return true; } catch (e) { showSnack((e as Error).message); return false; }
  };
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, py: 1, borderTop: `1px solid ${tokens.divider2}`, "&:hover .ek-tools": { opacity: 1 } }}>
      {n.kind === "todo" ? (
        <Checkbox checked={!!n.done_at} onChange={(e) => run(setNoteDone(n.id, e.target.checked, byName))} slotProps={{ input: { "aria-label": "Done" } }} sx={{ p: 0.5, mt: "-3px" }} />
      ) : <Box sx={{ width: 30, flex: "none" }} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <>
            <NoteEditor initial={n.body} folder={agentId} placeholder="Write here" onChange={setDraft} autoFocus />
            <Box sx={{ display: "flex", gap: 1, mt: 0.75 }}>
              <Button size="small" variant="contained" disableElevation disabled={isEmptyNote(draft || n.body)} onClick={async () => { if (await run(updateClientNote(n.id, noteForSaving(draft || n.body)))) setEditing(false); }}>Save</Button>
              <Button size="small" onClick={() => setEditing(false)}>Cancel</Button>
            </Box>
          </>
        ) : (
          <NoteView body={n.body} muted={!!n.done_at} />
        )}
        <Typography sx={{ fontSize: 12.5, color: tokens.ink3, mt: 0.25 }}>
          {day(n.created_at)}{n.created_by_name ? ` · ${n.created_by_name}` : ""}{n.done_at ? ` · done ${day(n.done_at)}${n.done_by_name ? ` by ${n.done_by_name}` : ""}` : ""}
          {n.link && <> · <Box component="a" href={n.link} target="_blank" rel="noopener" sx={{ color: "primary.main" }}>Open link</Box></>}
        </Typography>
      </Box>
      {!editing && (
        <Box className="ek-tools" sx={{ display: "flex", opacity: { xs: 1, md: 0 } }}>
          <Button size="small" onClick={() => { setDraft(""); setEditing(true); }} sx={{ minWidth: 0 }}>Edit</Button>
          <Tooltip title="Remove">
            <IconButton size="small" aria-label="Remove" onClick={() => { if (window.confirm("Remove this for good?")) void run(deleteClientNote(n.id)); }}><DeleteOutlineIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}

function ToDos({ agentId, byName }: { agentId: string; byName: string }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const { data: notes = [], error } = useQuery({ queryKey: ["clientNotes", agentId], queryFn: () => listClientNotes(agentId), retry: (n, e) => !(e instanceof CheckinsNotSetUp) && n < 1 });
  const [html, setHtml] = useState("");
  const [composer, setComposer] = useState(0);
  const [showDone, setShowDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const open = notes.filter((n) => n.kind === "todo" && !n.done_at);
  const done = notes.filter((n) => n.kind === "todo" && n.done_at);
  const plain = notes.filter((n) => n.kind === "note");
  const empty = isEmptyNote(html);

  async function add(kind: "todo" | "note") {
    if (empty) return;
    setSaving(true);
    try {
      await addClientNote(agentId, kind, noteForSaving(html), byName);
      setHtml("");
      setComposer((k) => k + 1); // a fresh, empty box
      await qc.invalidateQueries({ queryKey: ["clientNotes", agentId] });
    } catch (e) {
      showSnack((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error) return null;
  return (
    <Card title="To-dos and notes" action={open.length ? <Typography sx={{ fontSize: 11.5, color: tokens.ink3 }}>{open.length} to do</Typography> : undefined}>
      <NoteEditor key={composer} folder={agentId} placeholder="What needs doing, or notes from a call. Paste screenshots and links here." onChange={setHtml} />
      <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
        <Button variant="contained" disableElevation disabled={empty || saving} onClick={() => add("todo")}>Add to-do</Button>
        <Button variant="outlined" disabled={empty || saving} onClick={() => add("note")}>Add note</Button>
      </Box>

      <Box sx={{ mt: 1.75 }}>
        {open.length === 0 && plain.length === 0 && done.length === 0 && <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>Nothing yet.</Typography>}
        {open.map((n) => <NoteRow key={n.id} n={n} agentId={agentId} byName={byName} />)}
        {done.length > 0 && <Button size="small" onClick={() => setShowDone((v) => !v)} sx={{ mt: 0.5 }}>{showDone ? "Hide done" : `Show ${done.length} done`}</Button>}
        {showDone && done.map((n) => <NoteRow key={n.id} n={n} agentId={agentId} byName={byName} />)}
        {plain.length > 0 && (
          <>
            <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, mt: 2, mb: 0.5 }}>Notes</Typography>
            {plain.map((n) => <NoteRow key={n.id} n={n} agentId={agentId} byName={byName} />)}
          </>
        )}
      </Box>
    </Card>
  );
}

export default function CheckInsTab({ agentId, clientName, clientPhone }: { agentId: string; clientName: string; clientPhone: string | null }) {
  const { user } = useAuth();
  const { data: profiles } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles, staleTime: 5 * 60_000 });
  const me = profiles?.find((p) => p.agent_id === user?.id)?.display_name?.trim().split(/\s+/)[0] ?? "";
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 3fr) minmax(0, 2fr)" }, gap: 2, alignItems: "start" }}>
      <HowTheyFeel agentId={agentId} clientName={clientName} clientPhone={clientPhone} fromName={me} />
      <ToDos agentId={agentId} byName={me} />
    </Box>
  );
}

/** Next to the client's name: how they felt last time they answered. Opens the
 *  Check-ins tab. Nothing until there's an answer. */
export function CheckinChip({ agentId, to }: { agentId: string; to: string }) {
  const { data: rows } = useQuery({ queryKey: ["checkins", agentId], queryFn: () => listCheckins(agentId), retry: false });
  const latest = rows?.find((r) => r.answered_at && r.answers);
  if (!latest) return null;
  const s = scoreCheckin(latest.answers!, questionsOf(latest));
  return (
    <Tooltip title="Their last check-in">
      <Box component={RouterLink} to={to} sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, textDecoration: "none", color: "inherit", fontSize: 13 }}>
        <Dot risk={s.risk} />
        <b>{s.average}</b> of 5{s.risk === "red" ? <Box component="span" sx={{ color: tokens.red, fontWeight: 700 }}>&nbsp;At risk</Box> : null}
        <Box component="span" sx={{ color: tokens.ink2 }}>· {daysAgo(latest.answered_at!)}</Box>
      </Box>
    </Tooltip>
  );
}
