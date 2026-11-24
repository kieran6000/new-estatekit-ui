import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Badge, Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import { draftPing, sendPing } from "../api/checkins";
import { useSnack } from "../hooks/useSnack";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { listOpenTodos, listTeam, type NoteFor } from "../api/checkins";
import { useAuth } from "../hooks/useAuth";
import { tokens } from "../theme";

// Who a to-do or note is for (they get a WhatsApp), and when a to-do is due.
// Two quiet buttons until used; then they show what was picked.

export const NOBODY: NoteFor = { assignedTo: null, assignedToName: null, dueOn: null };

export const useTeam = () => useQuery({ queryKey: ["team"], queryFn: listTeam, staleTime: 30 * 60_000 });

/** Today in South Africa, "2026-11-10". */
export const todaySA = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });

export type DueState = "overdue" | "today" | "later";
export const dueState = (due: string, today = todaySA()): DueState => (due < today ? "overdue" : due === today ? "today" : "later");

/** "Today", "Tomorrow", "Fri 14 Nov". */
export function dueWords(due: string, today = todaySA()): string {
  if (due === today) return "Today";
  const t = new Date(`${today}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  if (due === t.toISOString().slice(0, 10)) return "Tomorrow";
  return new Date(`${due}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
}

// Working hours in South Africa: Mon–Fri, 08:00–17:00 SAST (UTC+2, no DST).
// A to-do is "due" at the end of business (17:00) on its date.
const BIZ_START = 8;
const BIZ_END = 17;
/** SAST wall-clock day-of-week (0=Sun) and hour for an instant. */
function sastClock(d: Date) {
  const t = new Date(d.getTime() + 2 * 60 * 60_000);
  return { dow: t.getUTCDay(), hour: t.getUTCHours() + t.getUTCMinutes() / 60 };
}
/** Whole business hours between now and 17:00 SAST on the due date. `null` when
 *  the date is too far off to bother showing a countdown (over ~5 days). */
export function businessHoursLeft(due: string, now = new Date()): number | null {
  const target = new Date(`${due}T17:00:00+02:00`).getTime();
  const start = now.getTime();
  if (start >= target) return 0;
  if (target - start > 5 * 864e5) return null;
  let mins = 0;
  const STEP = 15;
  for (let t = start; t < target; t += STEP * 60_000) {
    const { dow, hour } = sastClock(new Date(t));
    if (dow >= 1 && dow <= 5 && hour >= BIZ_START && hour < BIZ_END) mins += STEP;
  }
  return mins / 60;
}
/** "5h", "under 1h", "now", or null when it's not worth a countdown. */
export function hoursLeftWords(due: string, done: boolean): string | null {
  if (done) return null;
  const h = businessHoursLeft(due);
  if (h === null) return null;
  if (h <= 0) return "now";
  if (h < 1) return "under 1h";
  return `${Math.round(h)}h`;
}

const pill = (on: boolean, tone?: "red" | "amber") => ({
  minWidth: 0, px: 1, py: 0.25, fontSize: 13, fontWeight: on ? 600 : 500, borderRadius: "999px", textTransform: "none",
  color: tone === "red" ? tokens.red : tone === "amber" ? tokens.amber : on ? "text.primary" : tokens.ink2,
  bgcolor: tone === "red" ? tokens.redTint : tone === "amber" ? tokens.amberTint : on ? tokens.surface2 : "transparent",
  border: `1px solid ${tone === "red" ? tokens.redBorder : tone === "amber" ? tokens.amberBorder : on ? tokens.divider : "transparent"}`,
});

/** A teammate's face (their photo, or their initial). */
function PersonAvatar({ name, src, size }: { name: string | null; src?: string | null; size: number }) {
  return (
    <Avatar src={src ?? undefined} alt={name ?? ""} sx={{ width: size, height: size, fontSize: size * 0.5, fontWeight: 600, bgcolor: tokens.primary, color: "#fff" }}>
      {(name ?? "?").trim()[0]?.toUpperCase()}
    </Avatar>
  );
}

const fieldLabel = { fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: tokens.ink2 } as const;

/** Picking who a to-do/note is for, and when it's due. Assigning is a row of
 *  tappable faces — tap one to give it to them (they get a WhatsApp), tap again
 *  to take it back. One can be chosen; the chosen one is filled and ticked. */
export function ForAndDue({ value, onChange, showDue = true }: { value: NoteFor; onChange: (v: NoteFor) => void; showDue?: boolean }) {
  const { data: team = [] } = useTeam();
  const dateRef = useRef<HTMLInputElement>(null);
  const tone = value.dueOn ? (dueState(value.dueOn) === "overdue" ? "red" : dueState(value.dueOn) === "today" ? "amber" : undefined) : undefined;

  // Tap a face to assign; tap the chosen one again to clear it (single pick).
  const pick = (p: { agent_id: string; name: string }) =>
    onChange(p.agent_id === value.assignedTo
      ? { ...value, assignedTo: null, assignedToName: null }
      : { ...value, assignedTo: p.agent_id, assignedToName: p.name });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
      <Box>
        <Typography sx={{ ...fieldLabel, mb: 0.625, display: "flex", alignItems: "center", gap: 0.5 }}>
          Assign to
          <Box component="span" sx={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: tokens.ink3 }}>· they get a WhatsApp</Box>
        </Typography>
        {team.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: tokens.ink3 }}>No one to assign to yet.</Typography>
        ) : (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {team.map((p) => {
              const on = p.agent_id === value.assignedTo;
              return (
                <Tooltip key={p.agent_id} title={on ? `Assigned to ${p.name} — tap to undo` : `Assign to ${p.name}`}>
                  <ButtonBase
                    aria-pressed={on}
                    onClick={() => pick(p)}
                    sx={{
                      display: "inline-flex", alignItems: "center", gap: 0.625, pl: 0.5, pr: 1.25, py: 0.375, borderRadius: "999px",
                      border: `1.5px solid ${on ? tokens.primary : tokens.divider}`,
                      bgcolor: on ? tokens.primaryBg : "background.paper",
                      color: on ? tokens.primary : "text.primary",
                      fontSize: 13.5, fontWeight: on ? 700 : 500, transition: "background-color .12s, border-color .12s",
                      "&:hover": { borderColor: on ? tokens.primary : tokens.ink3, bgcolor: on ? tokens.primaryBg : tokens.hover },
                      "&:focus-visible": { outline: `2px solid ${tokens.primary}`, outlineOffset: 2 },
                    }}
                  >
                    <PersonAvatar name={p.name} src={p.avatar_url} size={22} />
                    {p.name}
                    {on && <CheckRoundedIcon sx={{ fontSize: 16 }} />}
                  </ButtonBase>
                </Tooltip>
              );
            })}
          </Box>
        )}
      </Box>

      {showDue && (
        <Box>
          <Typography sx={{ ...fieldLabel, mb: 0.625 }}>Due date</Typography>
          <Box sx={{ display: "inline-flex", alignItems: "center", position: "relative" }}>
            <Button
              size="small"
              startIcon={<EventRoundedIcon sx={{ fontSize: "17px !important" }} />}
              onClick={() => { const el = dateRef.current; if (!el) return; try { el.showPicker(); } catch { el.focus(); el.click(); } }}
              sx={pill(!!value.dueOn, tone)}
            >
              {value.dueOn ? `${dueWords(value.dueOn)}${tone !== "red" && hoursLeftWords(value.dueOn, false) ? ` · ${hoursLeftWords(value.dueOn, false)}` : ""}` : "Set a date…"}
            </Button>
            {value.dueOn && (
              <IconButton size="small" aria-label="No due date" onClick={() => onChange({ ...value, dueOn: null })} sx={{ p: 0.25, ml: 0.25 }}>
                <CloseRoundedIcon sx={{ fontSize: 15 }} />
              </IconButton>
            )}
            <input
              ref={dateRef}
              type="date"
              aria-label="Due date"
              tabIndex={-1}
              value={value.dueOn ?? ""}
              onChange={(e) => onChange({ ...value, dueOn: e.target.value || null })}
              style={{ position: "absolute", left: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none", border: 0, padding: 0 }}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}

/** Under a saved to-do or note: whose it is (their face + name) and when it's
 *  due, with business hours left when the clock is ticking. Red when late. */
export function ForAndDueTags({ assignedTo, assignedToName, dueOn, done }: { assignedTo?: string | null; assignedToName: string | null; dueOn: string | null; done: boolean }) {
  const { data: team = [] } = useTeam();
  if (!assignedToName && !dueOn) return null;
  const s = dueOn && !done ? dueState(dueOn) : null;
  const avatar = assignedTo ? team.find((p) => p.agent_id === assignedTo)?.avatar_url : null;
  const left = dueOn ? hoursLeftWords(dueOn, done) : null;
  return (
    <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 0.5 }}>
      {assignedToName && (
        <Tooltip title={`For ${assignedToName}`}>
          <Box component="span" sx={{ ...pill(true), display: "inline-flex", alignItems: "center", gap: 0.5, py: "1px", pl: "2px", pr: 1, fontSize: 12.5, fontWeight: 500 }}>
            <PersonAvatar name={assignedToName} src={avatar} size={18} />{assignedToName}
          </Box>
        </Tooltip>
      )}
      {dueOn && (
        <Box component="span" sx={{ ...pill(true, s === "overdue" ? "red" : s === "today" ? "amber" : undefined), display: "inline-flex", alignItems: "center", gap: 0.5, py: "1px", fontSize: 12.5, fontWeight: s ? 600 : 500 }}>
          <EventRoundedIcon sx={{ fontSize: 14 }} />
          {s === "overdue" ? `Late · was due ${dueWords(dueOn)}` : `Due ${dueWords(dueOn)}`}
          {s !== "overdue" && left && <Box component="span" sx={{ fontWeight: 700 }}>· {left}</Box>}
        </Box>
      )}
    </Box>
  );
}

/** Right after giving a to-do to someone: the WhatsApp, written for you,
 *  to change as you like. Send goes from the business number. */
export function TellDialog({ noteId, toName, onClose }: { noteId: string; toName: string; onClose: () => void }) {
  const showSnack = useSnack();
  const [text, setText] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  // WhatsApp's own formatting: *bold*, _italic_, ~strikethrough~ around the selected words.
  const wrap = (mark: string) => {
    const el = boxRef.current;
    if (!el || text === null) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const picked = text.slice(a, b);
    // Already wrapped: take the marks off again.
    if (picked.length > 1 && picked.startsWith(mark) && picked.endsWith(mark)) {
      setText(text.slice(0, a) + picked.slice(1, -1) + text.slice(b));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a, b - 2); });
      return;
    }
    // Spaces stay outside the marks, or WhatsApp won't format it.
    const lead = picked.match(/^\s*/)![0];
    const trail = picked.match(/\s*$/)![0];
    const core = picked.trim();
    const middle = core ? `${mark}${core}${mark}` : `${mark}${mark}`;
    setText(text.slice(0, a) + lead + middle + trail + text.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      if (core) el.setSelectionRange(a + lead.length, a + lead.length + middle.length);
      else el.setSelectionRange(a + lead.length + 1, a + lead.length + 1);
    });
  };
  const fmt = (title: string, mark: string, look: React.ReactNode) => (
    <Tooltip title={title}>
      <IconButton size="small" aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={() => wrap(mark)} sx={{ width: 30, height: 30, fontSize: 15, color: tokens.ink2 }}>{look}</IconButton>
    </Tooltip>
  );
  useEffect(() => {
    let gone = false;
    draftPing(noteId).then((t) => { if (!gone) setText(t); }).catch((e) => { if (!gone) { showSnack((e as Error).message); onClose(); } });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);
  async function send() {
    if (!text?.trim()) return;
    setSending(true);
    const ok = await sendPing(noteId, text);
    setSending(false);
    showSnack(ok ? `Sent to ${toName}` : `It didn't go through. Try again, or message ${toName} yourself.`);
    if (ok) onClose();
  }
  return (
    <Dialog open onClose={sending ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 0.5 }}>WhatsApp to {toName}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13, color: tokens.ink2, mb: 1.5 }}>Change the words if you like. It goes from the business number.</Typography>
        {text === null ? (
          <Box sx={{ height: 180, borderRadius: "4px", bgcolor: tokens.surface2 }} />
        ) : (
          <>
            <TextField
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (!(e.ctrlKey || e.metaKey)) return;
                const k = e.key.toLowerCase();
                if (k === "b" || k === "i") { e.preventDefault(); wrap(k === "b" ? "*" : "_"); }
              }}
              inputRef={boxRef}
              multiline minRows={7} maxRows={16} fullWidth autoFocus
              slotProps={{ htmlInput: { maxLength: 2000, "aria-label": "Message" } }}
            />
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, mt: 0.5 }}>
              {fmt("Bold (Ctrl+B)", "*", <b>B</b>)}
              {fmt("Italic (Ctrl+I)", "_", <i style={{ fontFamily: "Georgia, serif" }}>I</i>)}
              {fmt("Strikethrough", "~", <s>S</s>)}
              <Typography component="span" sx={{ fontSize: 12, color: tokens.ink3, ml: 0.75 }}>Select words, then tap. Shows as bold in WhatsApp.</Typography>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={sending}>Don't send</Button>
        <Button variant="contained" disableElevation onClick={() => void send()} disabled={sending || !text?.trim()}>{sending ? "Sending…" : "Send"}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Every open to-do, on every client, whoever it's for. */
export function useMyTodos() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["myTodos", user?.id], queryFn: listOpenTodos, enabled: !!user?.id, staleTime: 60_000, refetchInterval: 5 * 60_000 });
}

/** A red count on an account's photo: its open to-dos, whoever they're for
 *  (or, with no agentId, on every account). Nothing when there are none. */
export function TodoAvatarBadge({ agentId, children }: { agentId?: string; children: React.ReactNode }) {
  const { data = [] } = useMyTodos();
  const mine = agentId ? data.filter((t) => t.agent_id === agentId) : data;
  if (!mine.length) return <>{children}</>;
  const late = mine.some((t) => t.due_on && t.due_on < todaySA());
  return (
    <Tooltip title={`${mine.length} open to-do${mine.length === 1 ? "" : "s"}${late ? ", one is late" : ""}`}>
      <Badge badgeContent={mine.length} color="error" overlap="circular" max={9} sx={{ "& .MuiBadge-badge": { fontSize: 11, height: 18, minWidth: 18, border: "2px solid", borderColor: "background.paper" } }}>
        {children}
      </Badge>
    </Tooltip>
  );
}

/** A red count: open to-dos (on one client, or all of them). */
export function TodoBadge({ agentId, children }: { agentId?: string; children: React.ReactNode }) {
  const { data = [] } = useMyTodos();
  const mine = agentId ? data.filter((t) => t.agent_id === agentId) : data;
  return (
    <Badge badgeContent={mine.length} color="error" max={99} sx={{ "& .MuiBadge-badge": { fontSize: 11, height: 17, minWidth: 17, px: 0.5, right: -10, top: 2 } }}>
      {children}
    </Badge>
  );
}
