import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, TextField, Tooltip, Typography } from "@mui/material";
import { draftPing, sendPing } from "../api/checkins";
import { useSnack } from "../hooks/useSnack";
import PersonAddAltRoundedIcon from "@mui/icons-material/PersonAddAltRounded";
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

const pill = (on: boolean, tone?: "red" | "amber") => ({
  minWidth: 0, px: 1, py: 0.25, fontSize: 13, fontWeight: on ? 600 : 500, borderRadius: "999px", textTransform: "none",
  color: tone === "red" ? tokens.red : tone === "amber" ? tokens.amber : on ? "text.primary" : tokens.ink2,
  bgcolor: tone === "red" ? tokens.redTint : tone === "amber" ? tokens.amberTint : on ? tokens.surface2 : "transparent",
  border: `1px solid ${tone === "red" ? tokens.redBorder : tone === "amber" ? tokens.amberBorder : on ? tokens.divider : "transparent"}`,
});

/** The "For" and "Due" buttons. `showDue` only for to-dos. */
export function ForAndDue({ value, onChange, showDue = true }: { value: NoteFor; onChange: (v: NoteFor) => void; showDue?: boolean }) {
  const { data: team = [] } = useTeam();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const tone = value.dueOn ? (dueState(value.dueOn) === "overdue" ? "red" : dueState(value.dueOn) === "today" ? "amber" : undefined) : undefined;

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
      <Box sx={{ display: "inline-flex", alignItems: "center" }}>
        <Tooltip title={value.assignedTo ? "They got a WhatsApp. Tap to change." : "Give it to someone. They get a WhatsApp."}>
          <Button size="small" startIcon={<PersonAddAltRoundedIcon sx={{ fontSize: "17px !important" }} />} onClick={(e) => setMenu(e.currentTarget)} sx={pill(!!value.assignedTo)}>
            {value.assignedTo ? `For ${value.assignedToName}` : "For…"}
          </Button>
        </Tooltip>
        {value.assignedTo && (
          <IconButton size="small" aria-label="For nobody" onClick={() => onChange({ ...value, assignedTo: null, assignedToName: null })} sx={{ p: 0.25, ml: 0.25 }}>
            <CloseRoundedIcon sx={{ fontSize: 15 }} />
          </IconButton>
        )}
      </Box>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
        {team.map((p) => (
          <MenuItem key={p.agent_id} selected={p.agent_id === value.assignedTo} onClick={() => { onChange({ ...value, assignedTo: p.agent_id, assignedToName: p.name }); setMenu(null); }}>
            {p.name}
          </MenuItem>
        ))}
      </Menu>

      {showDue && (
        <Box sx={{ display: "inline-flex", alignItems: "center", position: "relative" }}>
          <Button
            size="small"
            startIcon={<EventRoundedIcon sx={{ fontSize: "17px !important" }} />}
            onClick={() => { const el = dateRef.current; if (!el) return; try { el.showPicker(); } catch { el.focus(); el.click(); } }}
            sx={pill(!!value.dueOn, tone)}
          >
            {value.dueOn ? `Due ${dueWords(value.dueOn)}` : "Due…"}
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
      )}
    </Box>
  );
}

/** Under a saved to-do or note: "For Aldredt · Due Fri 14 Nov" (red when late). */
export function ForAndDueTags({ assignedToName, dueOn, done }: { assignedToName: string | null; dueOn: string | null; done: boolean }) {
  if (!assignedToName && !dueOn) return null;
  const s = dueOn && !done ? dueState(dueOn) : null;
  return (
    <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 0.5 }}>
      {assignedToName && <Box component="span" sx={{ ...pill(true), display: "inline-flex", alignItems: "center", gap: 0.5, py: "1px", fontSize: 12.5, fontWeight: 500 }}><PersonAddAltRoundedIcon sx={{ fontSize: 14 }} />For {assignedToName}</Box>}
      {dueOn && (
        <Box component="span" sx={{ ...pill(true, s === "overdue" ? "red" : s === "today" ? "amber" : undefined), display: "inline-flex", alignItems: "center", gap: 0.5, py: "1px", fontSize: 12.5, fontWeight: s ? 600 : 500 }}>
          <EventRoundedIcon sx={{ fontSize: 14 }} />{s === "overdue" ? `Late · was due ${dueWords(dueOn)}` : `Due ${dueWords(dueOn)}`}
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
