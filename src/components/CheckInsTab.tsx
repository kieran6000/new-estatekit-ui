import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, ButtonBase, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { listAgentProfiles } from "../api/_client";
import {
  addClientNote, CheckinsNotSetUp, createCheckin, deleteClientNote, getCheckinQuestions, getReviewLink, listCheckins, listClientNotes,
  markCheckinSent, saveCheckinQuestions, saveReviewLink, setNoteDone, updateClientNote, type CheckinRow, type ClientNote,
} from "../api/checkins";
import { useAuth } from "../hooks/useAuth";
import { useSnack } from "../hooks/useSnack";
import { checkinMessage, checkinState, cleanQuestions, daysAgo, DEFAULT_QUESTIONS, newQuestionId, scoreCheckin, whatTheySaid, type CheckinQuestion } from "../lib/checkin";
import { waDigits } from "../lib/phone";
import { isEmptyNote, noteForSaving } from "../lib/richNote";
import { tokens } from "../theme";
import { NoteEditor, NoteView } from "./RichNote";

// The client's Check-ins tab: how they're feeling, sending a check-in, and what
// the team has to do for them. Clients answer when they answer, so it shows
// what happened and when, not a schedule they've fallen behind on.

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

/** A question as a single line: what it asks and how they answer. */
function QuestionRow({ n, q, onOpen }: { n: number; q: CheckinQuestion; onOpen: () => void }) {
  const how = q.type === "rating" ? `Stars, from "${q.low || "Poor"}" to "${q.high || "Great"}"` : "They write an answer (optional)";
  return (
    <ButtonBase onClick={onOpen} sx={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 1.5, px: 1.5, py: 1.25, borderRadius: "8px", "&:hover": { bgcolor: tokens.surface2 } }}>
      <Typography sx={{ fontSize: 14, color: tokens.ink3, width: 18, flex: "none", fontVariantNumeric: "tabular-nums" }}>{n}</Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 15.5, color: q.label.trim() ? undefined : tokens.red }}>{q.label.trim() || "No question written yet"}</Typography>
        <Typography sx={{ fontSize: 13, color: tokens.ink2, mt: 0.25 }}>{how}</Typography>
      </Box>
      <EditOutlinedIcon sx={{ fontSize: 18, color: tokens.ink3, flex: "none" }} />
    </ButtonBase>
  );
}

/** The one question being changed. Everything else stays folded away. */
function QuestionEditor({ n, total, q, onChange, onMove, onRemove, onDone }: {
  n: number; total: number; q: CheckinQuestion; onChange: (p: Partial<CheckinQuestion>) => void; onMove: (by: number) => void; onRemove: () => void; onDone: () => void;
}) {
  return (
    <Box sx={{ p: 2, borderRadius: "8px", border: `1px solid ${tokens.divider}`, bgcolor: tokens.surface2, display: "flex", flexDirection: "column", gap: 2 }}>
      <TextField label={`Question ${n}`} value={q.label} onChange={(e) => onChange({ label: e.target.value })} multiline autoFocus fullWidth placeholder="How good were your leads this week?" />
      <Box>
        <Typography sx={{ fontSize: 13.5, color: tokens.ink2, mb: 0.75 }}>How do they answer?</Typography>
        <ToggleButtonGroup exclusive value={q.type} onChange={(_e, v) => v && onChange(v === "text" ? { type: "text", low: undefined, high: undefined } : { type: "rating", low: q.low || "Poor", high: q.high || "Great" })}
          sx={{ "& .MuiToggleButton-root": { textTransform: "none", fontSize: 14, px: 2, py: 0.75 } }}>
          <ToggleButton value="rating"><StarRoundedIcon sx={{ fontSize: 18, mr: 0.75, color: "#f59e0b" }} />Stars</ToggleButton>
          <ToggleButton value="text">Writing</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {q.type === "rating" && (
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <TextField size="small" label="1 star means" value={q.low ?? ""} onChange={(e) => onChange({ low: e.target.value })} sx={{ flex: "1 1 160px" }} />
          <TextField size="small" label="5 stars mean" value={q.high ?? ""} onChange={(e) => onChange({ high: e.target.value })} sx={{ flex: "1 1 160px" }} />
        </Box>
      )}
      <TextField size="small" label="Name on the client's page" value={q.short} onChange={(e) => onChange({ short: e.target.value })} placeholder={q.label.trim().slice(0, 30) || "Lead quality"}
        helperText="A few words, so the answers fit on the Check-ins tab. Left empty, the question is used." />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Button size="small" disabled={n === 1} onClick={() => onMove(-1)}>Move up</Button>
        <Button size="small" disabled={n === total} onClick={() => onMove(1)}>Move down</Button>
        <Button size="small" color="error" onClick={onRemove}>Remove</Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" onClick={onDone}>Done</Button>
      </Box>
    </Box>
  );
}

function EditQuestions({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const { data: saved } = useQuery({ queryKey: ["checkinQuestions"], queryFn: getCheckinQuestions });
  const { data: savedReview } = useQuery({ queryKey: ["checkinReviewLink"], queryFn: getReviewLink });
  const [qs, setQs] = useState<CheckinQuestion[] | null>(null);
  const [open, setOpen] = useState<string | null>(null); // the one question being changed
  const [review, setReview] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewLink = (review ?? savedReview ?? "").trim();
  const reviewOk = !reviewLink || /^https:\/\/\S+$/i.test(reviewLink);
  const list = qs ?? saved ?? DEFAULT_QUESTIONS;
  const set = (i: number, patch: Partial<CheckinQuestion>) => setQs(list.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, by: number) => { const next = [...list]; const [q] = next.splice(i, 1); next.splice(i + by, 0, q); setQs(next); };
  const hasStars = list.some((q) => q.type === "rating");
  const ok = hasStars && list.every((q) => q.label.trim()) && reviewOk;
  function add() {
    const q: CheckinQuestion = { id: newQuestionId(), type: "rating", label: "", short: "", low: "Poor", high: "Great" };
    setQs([...list, q]);
    setOpen(q.id);
  }
  async function save() {
    try {
      await saveCheckinQuestions(list.map((q) => ({ ...q, short: q.short.trim() || q.label.trim() })));
      if (review !== null) await saveReviewLink(reviewLink);
      await qc.invalidateQueries({ queryKey: ["checkinQuestions"] });
      await qc.invalidateQueries({ queryKey: ["checkinReviewLink"] });
      showSnack("Saved. The next check-in you send uses these questions.");
      onClose();
    } catch (e) {
      showSnack((e as Error).message);
    }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 0.5 }}>Check-in questions</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 14, color: tokens.ink2, mb: 1.5 }}>What every client is asked. Tap a question to change it.</Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {list.map((q, i) =>
            open === q.id ? (
              <QuestionEditor key={q.id} n={i + 1} total={list.length} q={q} onChange={(p) => set(i, p)} onMove={(by) => move(i, by)}
                onRemove={() => { setQs(list.filter((_, j) => j !== i)); setOpen(null); }} onDone={() => setOpen(null)} />
            ) : (
              <QuestionRow key={q.id} n={i + 1} q={q} onOpen={() => setOpen(q.id)} />
            ),
          )}
        </Box>
        <Button startIcon={<AddIcon />} onClick={add} sx={{ mt: 1 }}>Add a question</Button>
        {!hasStars && <Typography sx={{ fontSize: 13.5, color: tokens.red, mt: 1 }}>Keep at least one star question, so you can see how they're feeling.</Typography>}

        <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${tokens.divider2}` }}>
          {reviewOpen ? (
            <Box sx={{ p: 2, borderRadius: "8px", border: `1px solid ${tokens.divider}`, bgcolor: tokens.surface2, display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>Clients who give a really good check-in are asked, kindly, to leave a Google review. Leave the link empty and nobody is asked.</Typography>
              <TextField size="small" fullWidth autoFocus label="Your Google review link" placeholder="https://g.page/r/…/review" value={review ?? savedReview ?? ""} onChange={(e) => setReview(e.target.value)}
                error={!reviewOk} helperText={reviewOk ? "In Google Business Profile, choose \"Ask for reviews\" and copy the link." : "This needs to start with https://"} />
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}><Button variant="outlined" onClick={() => setReviewOpen(false)} disabled={!reviewOk}>Done</Button></Box>
            </Box>
          ) : (
            <ButtonBase onClick={() => setReviewOpen(true)} sx={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 1.5, px: 1.5, py: 1.25, borderRadius: "8px", "&:hover": { bgcolor: tokens.surface2 } }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 15.5 }}>Ask happy clients for a Google review</Typography>
                <Typography sx={{ fontSize: 13, color: reviewLink ? tokens.green : tokens.ink2, mt: 0.25 }}>{reviewLink ? "On" : "Off: add your review link to switch it on"}</Typography>
              </Box>
              <EditOutlinedIcon sx={{ fontSize: 18, color: tokens.ink3 }} />
            </ButtonBase>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disableElevation disabled={!ok} onClick={save}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Five stars, filled to the score: the same look the client tapped. */
function Stars({ n, size = 20 }: { n: number; size?: number }) {
  const filled = Math.round(n);
  return (
    <Box sx={{ display: "inline-flex" }} aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => <StarRoundedIcon key={i} sx={{ fontSize: size, color: i <= filled ? scoreColor(filled) : tokens.surface2 }} />)}
    </Box>
  );
}

/** The one thing to do, top right: ask them on WhatsApp. Copying and the questions are in the ⋯ menu. */
function SendAction({ agentId, clientName, clientPhone, rows, fromName, onEditQuestions }: {
  agentId: string; clientName: string; clientPhone: string | null; rows: CheckinRow[]; fromName: string; onEditQuestions: () => void;
}) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const state = checkinState(rows);
  const first = clientName.trim().split(/\s+/)[0] ?? "";
  const phone = waDigits(clientPhone);
  const label = first ? `Ask ${first} how it's going` : "Ask how it's going";

  /** Their open check-in link, or a new one. Nobody has to say it was sent. */
  async function link(): Promise<CheckinRow> {
    const c = state.waiting ?? state.draft ?? (await createCheckin(agentId, fromName));
    if (!c.shared_at) await markCheckinSent(c.id, true).catch(() => {});
    void qc.invalidateQueries({ queryKey: ["checkins", agentId] });
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
      showSnack(first ? `Copied. Paste it in ${first}'s WhatsApp chat.` : "Copied. Paste it in their WhatsApp chat.");
    } catch (e) {
      showSnack(e instanceof Error && !/clipboard|document/i.test(e.message) ? e.message : "Couldn't copy it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, my: -0.5 }}>
      <Button size="small" variant="contained" disableElevation startIcon={phone ? <WhatsAppIcon /> : <ContentCopyIcon />} onClick={phone ? openWhatsApp : copy} disabled={busy}>{label}</Button>
      <IconButton size="small" aria-label="More" onClick={(e) => setMenu(e.currentTarget)}><MoreHorizIcon fontSize="small" /></IconButton>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} onClick={() => setMenu(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        {phone && <MenuItem onClick={copy}>Copy the message instead</MenuItem>}
        <MenuItem onClick={onEditQuestions}>Change the questions</MenuItem>
      </Menu>
    </Box>
  );
}

/** One answered check-in, read like a review: stars, when, what they said, then each score. */
function CheckinCard({ r, first }: { r: CheckinRow; first: boolean }) {
  const qs = questionsOf(r);
  const t = scoreCheckin(r.answers!, qs);
  const said = whatTheySaid(r.answers, qs, r.comment);
  const rated = qs.filter((q) => q.type === "rating" && typeof r.answers![q.id] === "number");
  return (
    <Box sx={{ py: 2, borderTop: first ? "none" : `1px solid ${tokens.divider2}` }}>
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 1, rowGap: 0.25 }}>
        <Stars n={t.average} size={first ? 24 : 20} />
        <Typography sx={{ fontSize: first ? 17 : 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{t.average}</Typography>
        <Typography sx={{ fontSize: 13.5, color: tokens.ink2 }}>· {day(r.answered_at!)}{first ? `, ${daysAgo(r.answered_at!)}` : ""}</Typography>
      </Box>
      {said && <Typography sx={{ fontSize: first ? 16 : 14.5, lineHeight: 1.55, mt: 1, whiteSpace: "pre-wrap", color: first ? undefined : tokens.ink2 }}>“{said}”</Typography>}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1.25 }}>
        {rated.map((q) => {
          const n = r.answers![q.id] as number;
          return (
            <Box key={q.id} sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.25, py: 0.4, borderRadius: 999, bgcolor: tokens.surface2, fontSize: 13 }}>
              <Box component="span" sx={{ color: tokens.ink2 }}>{q.short}</Box>
              <StarRoundedIcon sx={{ fontSize: 15, color: scoreColor(n) }} />
              <Box component="span" sx={{ fontWeight: 700 }}>{n}</Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function HowTheyFeel({ agentId, clientName, clientPhone, fromName }: { agentId: string; clientName: string; clientPhone: string | null; fromName: string }) {
  const [editing, setEditing] = useState(false);
  const { data: rows = [], isLoading, error } = useQuery({ queryKey: ["checkins", agentId], queryFn: () => listCheckins(agentId), retry: (n, e) => !(e instanceof CheckinsNotSetUp) && n < 1 });
  const answered = rows.filter((r) => r.answered_at && r.answers);
  const first = clientName.trim().split(/\s+/)[0] ?? "";

  if (error) return <Card title="What they told us"><Typography sx={{ fontSize: 14, color: tokens.ink2 }}>{error instanceof CheckinsNotSetUp ? "Check-ins aren't switched on yet." : "Couldn't load their check-ins. Refresh to try again."}</Typography></Card>;
  return (
    <Card title={first ? `What ${first} told us` : "What they told us"} action={<SendAction agentId={agentId} clientName={clientName} clientPhone={clientPhone} rows={rows} fromName={fromName} onEditQuestions={() => setEditing(true)} />}>
      {editing && <EditQuestions onClose={() => setEditing(false)} />}
      {isLoading ? null : answered.length ? (
        <>
          {answered.map((r, i) => <CheckinCard key={r.id} r={r} first={i === 0} />)}
        </>
      ) : (
        <Typography sx={{ fontSize: 14.5, color: tokens.ink2, py: 2 }}>{first || "They"} hasn't answered yet. Ask how it's going, and the answer shows here like a review.</Typography>
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
        <StarRoundedIcon sx={{ fontSize: 17, color: scoreColor(Math.round(s.average)) }} />
        <b>{s.average}</b> of 5
        <Box component="span" sx={{ color: tokens.ink2 }}>· {daysAgo(latest.answered_at!)}</Box>
      </Box>
    </Tooltip>
  );
}
