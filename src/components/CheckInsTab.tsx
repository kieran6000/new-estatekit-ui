import { createContext, Fragment, useContext, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, ButtonBase, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckIcon from "@mui/icons-material/Check";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import { listAgentProfiles } from "../api/_client";
import {
  addClientNote, checkinIdOf, checkinLink, CheckinsNotSetUp, createCheckin, deleteClientNote, getCheckinQuestions, getReviewLink, listCheckins, listClientNotes,
  markCheckinSent, saveCheckinQuestions, saveReviewLink, setNoteDone, updateClientNote, type CheckinRow, type ClientNote,
} from "../api/checkins";
import { useAuth } from "../hooks/useAuth";
import { useSnack } from "../hooks/useSnack";
import { checkinMessage, checkinState, cleanQuestions, daysAgo, DEFAULT_QUESTIONS, newQuestionId, scoreCheckin, whatTheySaid, type CheckinQuestion } from "../lib/checkin";
import { isEmptyNote, noteForSaving } from "../lib/richNote";
import { tokens } from "../theme";
import { Face } from "./Faces";
import ReplyRoundedIcon from "@mui/icons-material/ReplyRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";

// Check-ins and to-dos are usually about the same thing, so they point at each
// other: "Reply" on a check-in puts a little quote of it in the to-do box; the
// to-do keeps the quote, and tapping it lights up the check-in. A check-in
// shows how many to-dos are about it; tapping that lights them up.
interface Linking {
  replyTo: CheckinRow | null;
  reply: (r: CheckinRow | null) => void;
  /** A check-in id: light up that check-in. */
  spotCheckin: string | null;
  showCheckin: (id: string) => void;
  /** A check-in id: light up the to-dos and notes about it. */
  spotNotes: string | null;
  showNotes: (id: string) => void;
}
const LinkCtx = createContext<Linking | null>(null);
/** "Here it is": a soft tint that fades in and out, no rings. */
const flashSx = (on: boolean) => ({ transition: "background-color 700ms ease", bgcolor: on ? tokens.primaryBg : "transparent" });
/** Keyboard focus only: a thin ring, never the browser's black box on a click. */
const focusSx = { outline: "none", "&:focus-visible": { outline: `2px solid ${tokens.primary}`, outlineOffset: 2 } };
const useLinking = () => useContext(LinkCtx);
/** Light it up for a moment, then let it go. */
function useBriefly(): [string | null, (id: string) => void] {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { if (!id) return; const t = setTimeout(() => setId(null), 2600); return () => clearTimeout(t); }, [id]);
  return [id, (x: string) => { setId(null); setTimeout(() => setId(x), 0); }];
}
const scrollTo = (el: string) => setTimeout(() => document.getElementById(el)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);

/** A check-in, quoted small: "↩ Fri 6 Nov check-in ★ 3 · Can we change one area…". */
function CheckinQuote({ r, onClick, onRemove }: { r: CheckinRow; onClick?: () => void; onRemove?: () => void }) {
  const qs = questionsOf(r);
  const t = scoreCheckin(r.answers!, qs);
  const said = whatTheySaid(r.answers, qs, r.comment);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, pl: 1, pr: onRemove ? 0.25 : 1, py: 0.5, borderRadius: "8px", borderLeft: `3px solid ${tokens.primary}`, bgcolor: tokens.primaryBg }}>
      <Box component={onClick ? "button" : "div"} type={onClick ? "button" : undefined} onClick={onClick}
        title={onClick ? "Show this check-in" : undefined}
        sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, flex: 1, p: 0, border: 0, borderRadius: "4px", bgcolor: "transparent", font: "inherit", color: "inherit", textAlign: "left", cursor: onClick ? "pointer" : "default", ...focusSx, "&:hover .ek-q": onClick ? { textDecoration: "underline" } : undefined }}>
        <ReplyRoundedIcon sx={{ fontSize: 16, color: tokens.primary, flex: "none" }} />
        <Typography className="ek-q" sx={{ fontSize: 12.5, fontWeight: 600, flex: "none" }}>{day(r.answered_at!)} check-in</Typography>
        <Face n={t.average} size={15} />
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, flex: "none" }}>{t.average}</Typography>
        {said && <Typography noWrap sx={{ fontSize: 12.5, color: tokens.ink2, minWidth: 0 }}>· {said}</Typography>}
      </Box>
      {onRemove && <IconButton size="small" aria-label="Don't link it" onClick={onRemove} sx={{ p: 0.25 }}><CloseRoundedIcon sx={{ fontSize: 16 }} /></IconButton>}
    </Box>
  );
}

/** Under a check-in: Reply, and how many to-dos are about it. */
function CheckinLinks({ r, agentId }: { r: CheckinRow; agentId: string }) {
  const link = useLinking();
  const { data: notes = [] } = useQuery({ queryKey: ["clientNotes", agentId], queryFn: () => listClientNotes(agentId), retry: false });
  if (!link) return null;
  const about = notes.filter((n) => checkinIdOf(n.link) === r.id);
  const todos = about.filter((n) => n.kind === "todo" && !n.done_at).length;
  const other = about.length - todos;
  const words = [todos ? `${todos} to-do${todos === 1 ? "" : "s"}` : "", other ? `${other} ${todos ? "more" : `note${other === 1 ? "" : "s"}`}` : ""].filter(Boolean).join(" · ");
  return (
    <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, mt: 1.25 }}>
      <Button size="small" startIcon={<ReplyRoundedIcon />} onClick={() => link.reply(r)} sx={{ ml: -0.75 }}>Reply with a to-do</Button>
      {about.length > 0 && (
        <Button size="small" startIcon={<ChecklistRoundedIcon />} onClick={() => link.showNotes(r.id)} sx={{ color: tokens.ink2 }}>{words}</Button>
      )}
    </Box>
  );
}

import { NoteEditor, NoteView } from "./RichNote";

// The client's Check-ins tab: how they're feeling, sending a check-in, and what
// the team has to do for them. Clients answer when they answer, so it shows
// what happened and when, not a schedule they've fallen behind on.

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short" });
const linkFor = (c: CheckinRow) => `${window.location.origin}/k/${c.token}`;
const questionsOf = (r: CheckinRow) => cleanQuestions(r.questions ?? DEFAULT_QUESTIONS);

function Card({ title, action, children, stackOnPhone }: { title: string; action?: React.ReactNode; children: React.ReactNode; /** On a phone, the action goes on its own line. */ stackOnPhone?: boolean }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", minWidth: 0 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 0.5, minHeight: 40, display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 1, rowGap: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: "1 1 auto", minWidth: stackOnPhone ? { xs: "100%", sm: 0 } : 0 }}>{title}</Typography>
        {action}
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>{children}</Box>
    </Box>
  );
}

/** A question as a single line: what it asks and how they answer. */
function QuestionRow({ n, q, onOpen }: { n: number; q: CheckinQuestion; onOpen: () => void }) {
  const how = q.type === "rating" ? `Faces, from "${q.low || "Poor"}" to "${q.high || "Great"}"` : "They write an answer (optional)";
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
          <ToggleButton value="rating"><Box component="span" sx={{ mr: 0.75, display: "inline-flex" }}><Face n={5} size={18} /></Box>Faces</ToggleButton>
          <ToggleButton value="text">Writing</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {q.type === "rating" && (
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <TextField size="small" label="Saddest face means" value={q.low ?? ""} onChange={(e) => onChange({ low: e.target.value })} sx={{ flex: "1 1 160px" }} />
          <TextField size="small" label="Happiest face means" value={q.high ?? ""} onChange={(e) => onChange({ high: e.target.value })} sx={{ flex: "1 1 160px" }} />
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
        {!hasStars && <Typography sx={{ fontSize: 13.5, color: tokens.red, mt: 1 }}>Keep at least one face question, so you can see how they're feeling.</Typography>}

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

/** Top right: one button that copies the check-in message, ready to paste in their WhatsApp. */
function SendAction({ agentId, clientName, rows, fromName, onEditQuestions }: {
  agentId: string; clientName: string; rows: CheckinRow[]; fromName: string; onEditQuestions: () => void;
}) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const state = checkinState(rows);
  const first = clientName.trim().split(/\s+/)[0] ?? "";

  /** Their open check-in link, or a new one. Nobody has to say it was sent. */
  async function link(): Promise<CheckinRow> {
    const c = state.waiting ?? state.draft ?? (await createCheckin(agentId, fromName));
    if (!c.shared_at) await markCheckinSent(c.id, true).catch(() => {});
    void qc.invalidateQueries({ queryKey: ["checkins", agentId] });
    return c;
  }
  async function send() {
    setBusy(true);
    try {
      const c = await link();
      await navigator.clipboard.writeText(checkinMessage(first, fromName, linkFor(c)));
      showSnack(first ? `Check-in copied. Paste it in your WhatsApp chat with ${first}.` : "Check-in copied. Paste it in their WhatsApp chat.");
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch (e) {
      showSnack(e instanceof Error && !/clipboard|document/i.test(e.message) ? e.message : "Couldn't copy it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: { xs: "space-between", sm: "flex-end" }, gap: 1, my: -0.5, width: { xs: "100%", sm: "auto" } }}>
      <Button size="small" onClick={onEditQuestions} sx={{ color: tokens.ink2, ml: { xs: -0.75, sm: 0 } }}>Edit questions</Button>
      <Tooltip title={copied ? "" : "Copies the message with their link, ready to paste in WhatsApp"}>
        <Button size="small" variant="contained" disableElevation onClick={send} disabled={busy}
          startIcon={copied ? <CheckIcon /> : <ContentCopyRoundedIcon />}
          sx={copied ? { bgcolor: tokens.greenCall, "&:hover": { bgcolor: tokens.greenCallHover } } : undefined}>
          {copied ? "Copied! Paste it in WhatsApp" : <>Send <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{first || ""}&nbsp;</Box>a check-in</>}
        </Button>
      </Tooltip>
    </Box>
  );
}

/** Each score as quiet text: "Lead quality 3 · Enough leads 4". Low ones in red, so they're the only thing that stands out. */
function Breakdown({ r }: { r: CheckinRow }) {
  const qs = questionsOf(r);
  const rated = qs.filter((q) => q.type === "rating" && typeof r.answers![q.id] === "number");
  return (
    <Typography sx={{ fontSize: 13.5, color: tokens.ink2, lineHeight: 1.7 }}>
      {rated.map((q, i) => {
        const n = r.answers![q.id] as number;
        return (
          <Fragment key={q.id}>
            {i > 0 && <Box component="span" sx={{ mx: 1, color: tokens.ink3 }}>·</Box>}{" "}
            <Box component="span" sx={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 0.5, verticalAlign: "middle" }}>{q.short} <Face n={n} size={16} /><Box component="span" sx={{ fontWeight: 700, color: n <= 2 ? tokens.red : "text.primary" }}>{n}</Box></Box>
          </Fragment>
        );
      })}
    </Typography>
  );
}

/** Their latest answer, in full: the one that matters. */
function LatestCheckin({ r, agentId }: { r: CheckinRow; agentId: string }) {
  const qs = questionsOf(r);
  const t = scoreCheckin(r.answers!, qs);
  const said = whatTheySaid(r.answers, qs, r.comment);
  const lit = useLinking()?.spotCheckin === r.id;
  return (
    <Box id={`checkin-${r.id}`} sx={{ pt: 1, pb: 2, px: 1, mx: -1, borderRadius: "8px", ...flashSx(lit) }}>
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 1.25, rowGap: 0.25 }}>
        <Face n={t.average} size={34} />
        <Typography sx={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{t.average}</Typography>
        <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>{day(r.answered_at!)} · {daysAgo(r.answered_at!)}</Typography>
      </Box>
      {said && <Typography sx={{ fontSize: 16.5, lineHeight: 1.55, mt: 1.25, whiteSpace: "pre-wrap" }}>“{said}”</Typography>}
      <Box sx={{ mt: 1.25 }}><Breakdown r={r} /></Box>
      <CheckinLinks r={r} agentId={agentId} />
    </Box>
  );
}

/** An older answer as one line: when, a face, the start of what they said. Tap for the rest. */
function EarlierCheckin({ r, agentId }: { r: CheckinRow; agentId: string }) {
  const [open, setOpen] = useState(false);
  const qs = questionsOf(r);
  const t = scoreCheckin(r.answers!, qs);
  const said = whatTheySaid(r.answers, qs, r.comment);
  const lit = useLinking()?.spotCheckin === r.id;
  useEffect(() => { if (lit) setOpen(true); }, [lit]);
  return (
    <Box id={`checkin-${r.id}`} sx={{ borderTop: `1px solid ${tokens.divider2}`, borderRadius: "6px", ...flashSx(lit) }}>
      <ButtonBase onClick={() => setOpen(!open)} aria-expanded={open}
        sx={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 1.5, py: 1.1, px: 0.75, borderRadius: "6px", cursor: "pointer", bgcolor: open ? tokens.surface2 : "transparent", "&:hover": { bgcolor: tokens.surface2 }, "&:hover .ek-open": { bgcolor: tokens.primaryBg } }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 500, width: 92, flex: "none" }}>{day(r.answered_at!)}</Typography>
        <Face n={t.average} size={18} />
        <Typography sx={{ fontSize: 13.5, fontWeight: 600, width: 26, flex: "none", fontVariantNumeric: "tabular-nums" }}>{t.average}</Typography>
        <Typography noWrap sx={{ fontSize: 13.5, color: tokens.ink2, flex: 1, minWidth: 0 }}>{open ? "" : said ? `“${said}”` : ""}</Typography>
        <Box className="ek-open" sx={{ display: "flex", alignItems: "center", gap: 0.25, flex: "none", color: "primary.main", fontSize: 13, fontWeight: 600, px: 1, py: 0.25, borderRadius: 999, bgcolor: open ? tokens.primaryBg : "transparent" }}>
          {open ? "Close" : "Open"}
          <ExpandMoreIcon sx={{ fontSize: 18, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
        </Box>
      </ButtonBase>
      {open && (
        <Box sx={{ pl: { sm: "112px" }, px: 0.5, pb: 1.5 }}>
          {said && <Typography sx={{ fontSize: 14.5, lineHeight: 1.55, mb: 0.75, whiteSpace: "pre-wrap" }}>“{said}”</Typography>}
          <Breakdown r={r} />
          <CheckinLinks r={r} agentId={agentId} />
        </Box>
      )}
    </Box>
  );
}

function HowTheyFeel({ agentId, clientName, fromName }: { agentId: string; clientName: string; fromName: string }) {
  const [editing, setEditing] = useState(false);
  const { data: rows = [], isLoading, error } = useQuery({ queryKey: ["checkins", agentId], queryFn: () => listCheckins(agentId), retry: (n, e) => !(e instanceof CheckinsNotSetUp) && n < 1 });
  const answered = rows.filter((r) => r.answered_at && r.answers);
  const first = clientName.trim().split(/\s+/)[0] ?? "";

  if (error) return <Card title="What they told us"><Typography sx={{ fontSize: 14, color: tokens.ink2 }}>{error instanceof CheckinsNotSetUp ? "Check-ins aren't switched on yet." : "Couldn't load their check-ins. Refresh to try again."}</Typography></Card>;
  return (
    <Card stackOnPhone title={first ? `What ${first} told us` : "What they told us"} action={<SendAction agentId={agentId} clientName={clientName} rows={rows} fromName={fromName} onEditQuestions={() => setEditing(true)} />}>
      {editing && <EditQuestions onClose={() => setEditing(false)} />}
      {isLoading ? null : answered.length ? (
        <>
          <LatestCheckin r={answered[0]} agentId={agentId} />
          {answered.slice(1).map((r) => <EarlierCheckin key={r.id} r={r} agentId={agentId} />)}
        </>
      ) : (
        <Typography sx={{ fontSize: 14.5, color: tokens.ink2, py: 2 }}>{first || "They"} hasn't answered yet. Ask how it's going, and the answer shows here like a review.</Typography>
      )}
    </Card>
  );
}

function NoteRow({ n, agentId, byName, about }: { n: ClientNote; agentId: string; byName: string; about?: CheckinRow }) {
  const link = useLinking();
  const lit = !!about && link?.spotNotes === about.id;
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const run = async (work: Promise<void>) => {
    try { await work; await qc.invalidateQueries({ queryKey: ["clientNotes", agentId] }); return true; } catch (e) { showSnack((e as Error).message); return false; }
  };
  return (
    <Box id={`note-${n.id}`} sx={{ display: "flex", alignItems: "flex-start", gap: 1, py: 1, borderTop: `1px solid ${tokens.divider2}`, borderRadius: "6px", ...flashSx(lit), "&:hover .ek-tools": { opacity: 1 } }}>
      {n.kind === "todo" ? (
        <Checkbox checked={!!n.done_at} onChange={(e) => run(setNoteDone(n.id, e.target.checked, byName))} slotProps={{ input: { "aria-label": "Done" } }} sx={{ p: 0.5, mt: "-3px" }} />
      ) : <Box sx={{ width: 30, flex: "none" }} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {about && <Box sx={{ mb: 0.5 }}><CheckinQuote r={about} onClick={link ? () => link.showCheckin(about.id) : undefined} /></Box>}
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
          {n.link && !checkinIdOf(n.link) && <> · <Box component="a" href={n.link} target="_blank" rel="noopener" sx={{ color: "primary.main" }}>Open link</Box></>}
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
  const link = useLinking();
  const { data: checkins = [] } = useQuery({ queryKey: ["checkins", agentId], queryFn: () => listCheckins(agentId), retry: false });
  const byId = new Map(checkins.filter((c) => c.answered_at && c.answers).map((c) => [c.id, c]));
  const aboutOf = (n: ClientNote) => { const id = checkinIdOf(n.link); return id ? byId.get(id) : undefined; };
  const open = notes.filter((n) => n.kind === "todo" && !n.done_at);
  const done = notes.filter((n) => n.kind === "todo" && n.done_at);
  const plain = notes.filter((n) => n.kind === "note");
  const empty = isEmptyNote(html);

  async function add(kind: "todo" | "note") {
    if (empty) return;
    setSaving(true);
    try {
      await addClientNote(agentId, kind, noteForSaving(html), byName, link?.replyTo ? checkinLink(agentId, link.replyTo.id) : null);
      link?.reply(null);
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
      {link?.replyTo && <Box sx={{ mb: 1 }}><CheckinQuote r={link.replyTo} onClick={() => link.showCheckin(link.replyTo!.id)} onRemove={() => link.reply(null)} /></Box>}
      <Box id="ek-composer"><NoteEditor key={composer} folder={agentId} placeholder={link?.replyTo ? "What needs doing about this check-in?" : "What needs doing, or notes from a call. Paste screenshots and links here."} onChange={setHtml} /></Box>
      <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
        <Button variant="contained" disableElevation disabled={empty || saving} onClick={() => add("todo")}>Add to-do</Button>
        <Button variant="outlined" disabled={empty || saving} onClick={() => add("note")}>Add note</Button>
      </Box>

      <Box sx={{ mt: 1.75 }}>
        {open.length === 0 && plain.length === 0 && done.length === 0 && <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>Nothing yet.</Typography>}
        {open.map((n) => <NoteRow key={n.id} n={n} agentId={agentId} byName={byName} about={aboutOf(n)} />)}
        {done.length > 0 && <Button size="small" onClick={() => setShowDone((v) => !v)} sx={{ mt: 0.5 }}>{showDone ? "Hide done" : `Show ${done.length} done`}</Button>}
        {showDone && done.map((n) => <NoteRow key={n.id} n={n} agentId={agentId} byName={byName} about={aboutOf(n)} />)}
        {plain.length > 0 && (
          <>
            <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, mt: 2, mb: 0.5 }}>Notes</Typography>
            {plain.map((n) => <NoteRow key={n.id} n={n} agentId={agentId} byName={byName} about={aboutOf(n)} />)}
          </>
        )}
      </Box>
    </Card>
  );
}

export default function CheckInsTab({ agentId, clientName }: { agentId: string; clientName: string; clientPhone?: string | null }) {
  const { user } = useAuth();
  const { data: profiles } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles, staleTime: 5 * 60_000 });
  const me = profiles?.find((p) => p.agent_id === user?.id)?.display_name?.trim().split(/\s+/)[0] ?? "";
  const qc = useQueryClient();
  const [replyTo, setReplyTo] = useState<CheckinRow | null>(null);
  const [spotCheckin, litCheckin] = useBriefly();
  const [spotNotes, litNotes] = useBriefly();
  const linking: Linking = {
    replyTo,
    reply: (r) => {
      setReplyTo(r);
      if (!r) return;
      scrollTo("ek-composer");
      setTimeout(() => (document.querySelector("#ek-composer [contenteditable]") as HTMLElement | null)?.focus(), 350);
    },
    spotCheckin,
    showCheckin: (id) => { litCheckin(id); scrollTo(`checkin-${id}`); },
    spotNotes,
    showNotes: (id) => {
      litNotes(id);
      const notes = qc.getQueryData<ClientNote[]>(["clientNotes", agentId]) ?? [];
      const firstNote = notes.find((n) => checkinIdOf(n.link) === id);
      if (firstNote) scrollTo(`note-${firstNote.id}`);
    },
  };
  return (
    <LinkCtx.Provider value={linking}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 3fr) minmax(0, 2fr)" }, gap: 2, alignItems: "start" }}>
        <HowTheyFeel agentId={agentId} clientName={clientName} fromName={me} />
        <ToDos agentId={agentId} byName={me} />
      </Box>
    </LinkCtx.Provider>
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
        <Face n={s.average} size={18} />
        <b>{s.average}</b> of 5
        <Box component="span" sx={{ color: tokens.ink2 }}>· {daysAgo(latest.answered_at!)}</Box>
      </Box>
    </Tooltip>
  );
}
