import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppBar, Avatar, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, InputBase, Menu, MenuItem, Select, Tab, Tabs, TextField, Toolbar, Tooltip, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import SearchIcon from "@mui/icons-material/Search";
import ReplyIcon from "@mui/icons-material/Reply";
import ForwardIcon from "@mui/icons-material/Forward";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import Draw from "@mui/icons-material/DriveFileRenameOutline";
import { tokens } from "../theme";
import {
  getThread, listMailboxes, listThreads, MailNotConnected, modifyThread, saveSignature, sendMail,
  type Folder, type Mailbox, type MessageFull, type ThreadSummary,
} from "../api/mail";

const LAST_MB = "ek.mail.mailbox";

function timeShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = (now.getTime() - d.getTime()) / 86400000;
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
const initials = (s: string) => (s.trim()[0] || "?").toUpperCase();
const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
const sigHtml = (sig: string) => (sig.trim() ? `<br><br>--<br>${sig.replace(/\n/g, "<br>")}` : "");

// ── Reading pane: one email body in an isolated iframe ──────────────────────
function Body({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const fit = () => {
    const f = ref.current;
    if (f?.contentWindow?.document?.body) f.style.height = `${f.contentWindow.document.body.scrollHeight + 8}px`;
  };
  return (
    <iframe
      ref={ref}
      onLoad={fit}
      title="message"
      sandbox=""
      srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>body{margin:0;font-family:Roboto,Arial,sans-serif;font-size:14px;line-height:1.5;color:#202124;word-wrap:break-word}img{max-width:100%;height:auto}a{color:#1a73e8}</style></head><body>${html}</body></html>`}
      style={{ width: "100%", border: 0, minHeight: 60 }}
    />
  );
}

// ── Compose / reply dialog ──────────────────────────────────────────────────
interface Draft { to: string; cc: string; subject: string; body: string; threadId?: string; inReplyTo?: string; references?: string; quoted?: string; }

function Compose({ mailbox, draft, onClose, onSent }: { mailbox: Mailbox; draft: Draft; onClose: () => void; onSent: () => void }) {
  const [d, setD] = useState(draft);
  const [showCc, setShowCc] = useState(!!draft.cc);
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: () => {
      const html = `<div>${esc(d.body).replace(/\n/g, "<br>")}</div>${sigHtml(mailbox.signature)}${d.quoted ? `<br><br>${d.quoted}` : ""}`;
      return sendMail(mailbox.email, { to: d.to, cc: d.cc || undefined, subject: d.subject, html, threadId: d.threadId, inReplyTo: d.inReplyTo, references: d.references });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mailThreads"] }); onSent(); },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 1 } }}>
      <DialogTitle sx={{ fontSize: 16, fontWeight: 600, py: 1.5 }}>{d.threadId ? "Reply" : "New message"}</DialogTitle>
      <DialogContent dividers sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ fontSize: 13, color: tokens.ink3, width: 44 }}>From</Typography>
          <Typography sx={{ fontSize: 14, color: tokens.ink }}>{mailbox.display_name} &lt;{mailbox.email}&gt;</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <TextField fullWidth size="small" label="To" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} />
          {!showCc && <Button size="small" onClick={() => setShowCc(true)}>Cc</Button>}
        </Box>
        {showCc && <TextField fullWidth size="small" label="Cc" value={d.cc} onChange={(e) => setD({ ...d, cc: e.target.value })} />}
        <TextField fullWidth size="small" label="Subject" value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} />
        <TextField
          fullWidth multiline minRows={8} placeholder="Write your message…"
          value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })}
          slotProps={{ htmlInput: { style: { fontSize: 14, lineHeight: 1.5 } } }}
        />
        {mailbox.signature.trim() && (
          <Typography sx={{ fontSize: 12, color: tokens.ink3, whiteSpace: "pre-wrap", borderTop: `1px solid ${tokens.divider}`, pt: 1 }}>
            — {mailbox.signature}
          </Typography>
        )}
        {send.isError && <Typography sx={{ fontSize: 13, color: tokens.red }}>Couldn't send: {(send.error as Error).message}</Typography>}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={onClose} color="inherit">Discard</Button>
        <Button variant="contained" disableElevation disabled={!d.to.trim() || send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? "Sending…" : "Send"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Signature editor ────────────────────────────────────────────────────────
function SignatureDialog({ mailbox, onClose, onSaved }: { mailbox: Mailbox; onClose: () => void; onSaved: () => void }) {
  const [sig, setSig] = useState(mailbox.signature);
  const save = useMutation({ mutationFn: () => saveSignature(mailbox.email, sig), onSuccess: onSaved });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 1 } }}>
      <DialogTitle sx={{ fontSize: 16, fontWeight: 600 }}>Signature · {mailbox.email}</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: 12.5, color: tokens.ink3, mb: 1 }}>Added to the bottom of every email you send from this mailbox.</Typography>
        <TextField fullWidth multiline minRows={5} value={sig} onChange={(e) => setSig(e.target.value)} placeholder={"Kieran Ouseb\nEstateKit\n072 000 0000"} />
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" disableElevation disabled={save.isPending} onClick={() => save.mutate()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function MailPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mailbox, setMailbox] = useState<string>(() => localStorage.getItem(LAST_MB) || "");
  const [folder, setFolder] = useState<Folder>("inbox");
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState<Draft | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [menuEl, setMenuEl] = useState<null | HTMLElement>(null);

  const mailboxes = useQuery({ queryKey: ["mailboxes"], queryFn: listMailboxes, staleTime: 5 * 60_000 });
  const mbList = mailboxes.data ?? [];
  const currentMb = useMemo(() => mbList.find((m) => m.email === mailbox) ?? mbList[0], [mbList, mailbox]);

  useEffect(() => {
    if (!mailbox && mbList.length) setMailbox(mbList[0].email);
  }, [mbList, mailbox]);
  useEffect(() => { if (currentMb) localStorage.setItem(LAST_MB, currentMb.email); }, [currentMb]);

  const threads = useQuery({
    queryKey: ["mailThreads", currentMb?.email, folder, search],
    queryFn: () => listThreads(currentMb!.email, folder, search || undefined),
    enabled: !!currentMb,
    staleTime: 30_000,
  });
  const thread = useQuery({
    queryKey: ["mailThread", currentMb?.email, selected],
    queryFn: () => getThread(currentMb!.email, selected!),
    enabled: !!currentMb && !!selected,
  });

  const notConnected = threads.error instanceof MailNotConnected;

  const act = useMutation({
    mutationFn: ({ id, change }: { id: string; change: { archive?: boolean; trash?: boolean; read?: boolean } }) => modifyThread(currentMb!.email, id, change),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mailThreads"] }); setSelected(null); },
  });

  const openThread = (id: string) => { setSelected(id); qc.invalidateQueries({ queryKey: ["mailThreads"] }); };

  const startReply = () => {
    const msgs = thread.data?.messages ?? [];
    const last = msgs[msgs.length - 1];
    if (!last || !currentMb) return;
    const quoted = `<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex;color:#555">On ${esc(last.date)}, ${esc(last.from.name)} wrote:<br>${last.html}</blockquote>`;
    setCompose({
      to: last.from.email, cc: "", subject: /^re:/i.test(last.subject) ? last.subject : `Re: ${last.subject}`,
      body: "", threadId: selected!, inReplyTo: last.messageId, references: last.messageId, quoted,
    });
  };
  const startForward = () => {
    const msgs = thread.data?.messages ?? [];
    const last = msgs[msgs.length - 1];
    if (!last) return;
    const quoted = `<br>---------- Forwarded message ----------<br>From: ${esc(last.from.name)} &lt;${esc(last.from.email)}&gt;<br>Subject: ${esc(last.subject)}<br><br>${last.html}`;
    setCompose({ to: "", cc: "", subject: /^fwd:/i.test(last.subject) ? last.subject : `Fwd: ${last.subject}`, body: "", quoted });
  };

  const showList = !selected; // mobile: list OR reading pane

  return (
    <Box sx={{ height: "100dvh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important", gap: 1 }}>
          <IconButton edge="start" onClick={() => (selected ? setSelected(null) : navigate(-1))} aria-label="Back"><ArrowBackIcon /></IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500, mr: 1 }}>Mail</Typography>
          {currentMb && (
            <Select
              size="small" value={currentMb.email}
              onChange={(e) => { setMailbox(e.target.value); setSelected(null); }}
              sx={{ fontSize: 14, bgcolor: "rgba(255,255,255,0.12)", color: "inherit", ".MuiSvgIcon-root": { color: "inherit" }, ".MuiOutlinedInput-notchedOutline": { border: 0 } }}
            >
              {mbList.map((m) => <MenuItem key={m.email} value={m.email} sx={{ fontSize: 14 }}>{m.display_name} · {m.email}</MenuItem>)}
            </Select>
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Refresh"><IconButton color="inherit" onClick={() => threads.refetch()}><RefreshIcon /></IconButton></Tooltip>
          <Tooltip title="Edit signature"><IconButton color="inherit" onClick={() => setSigOpen(true)}><Draw /></IconButton></Tooltip>
        </Toolbar>
      </AppBar>

      {/* Search + folders */}
      <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, display: "flex", alignItems: "center", gap: 1, px: 1.5 }}>
        <Tabs value={folder} onChange={(_e, v) => { setFolder(v); setSelected(null); }} sx={{ minHeight: 44 }}>
          <Tab value="inbox" label="Inbox" sx={{ minHeight: 44 }} />
          <Tab value="sent" label="Sent" sx={{ minHeight: 44 }} />
          <Tab value="all" label="All" sx={{ minHeight: 44 }} />
        </Tabs>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, bgcolor: tokens.hover, borderRadius: 1, px: 1, my: 0.75 }}>
          <SearchIcon sx={{ fontSize: 18, color: tokens.ink3 }} />
          <InputBase
            placeholder="Search mail" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setSearch(q); setSelected(null); } }}
            sx={{ fontSize: 13.5, width: { xs: 120, sm: 200 } }}
          />
        </Box>
      </Box>

      {/* Master / detail */}
      <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Thread list */}
        <Box sx={{ width: { xs: "100%", md: 380 }, display: { xs: showList ? "block" : "none", md: "block" }, borderRight: { md: `1px solid ${tokens.divider}` }, overflowY: "auto", bgcolor: "background.paper" }}>
          {notConnected && (
            <Box sx={{ p: 3 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.5 }}>Inbox not connected yet</Typography>
              <Typography sx={{ fontSize: 13, color: tokens.ink3, lineHeight: 1.5 }}>
                Add the Google service-account key (GOOGLE_SA_KEY) to the gmail function and this becomes your live {currentMb?.email} inbox — read, reply and send.
              </Typography>
            </Box>
          )}
          {threads.isLoading && <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}><CircularProgress size={22} /></Box>}
          {threads.isError && !notConnected && <Box sx={{ p: 3 }}><Typography sx={{ fontSize: 13, color: tokens.red }}>{(threads.error as Error).message}</Typography></Box>}
          {threads.data?.threads.length === 0 && <Box sx={{ p: 4, textAlign: "center" }}><Typography sx={{ fontSize: 14, color: tokens.ink3 }}>Nothing here.</Typography></Box>}
          {threads.data?.threads.map((t) => (
            <ThreadRow key={t.id} t={t} active={t.id === selected} onClick={() => openThread(t.id)} />
          ))}
        </Box>

        {/* Reading pane */}
        <Box sx={{ flex: 1, display: { xs: showList ? "none" : "block", md: "block" }, overflowY: "auto" }}>
          {!selected && <Box sx={{ display: { xs: "none", md: "flex" }, height: "100%", alignItems: "center", justifyContent: "center" }}><Typography sx={{ color: tokens.ink3, fontSize: 14 }}>Select an email to read</Typography></Box>}
          {selected && thread.isLoading && <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress size={24} /></Box>}
          {selected && thread.data && (
            <Box sx={{ maxWidth: 820, mx: "auto", p: { xs: 1.5, md: 3 } }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: 20, fontWeight: 500, flex: 1 }}>{thread.data.subject}</Typography>
                <Tooltip title="Archive"><IconButton size="small" onClick={() => act.mutate({ id: selected, change: { archive: true } })}><ArchiveOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Delete"><IconButton size="small" onClick={() => act.mutate({ id: selected, change: { trash: true } })}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
              </Box>
              {thread.data.messages.map((m) => <MessageBlock key={m.id} m={m} />)}
              <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
                <Button variant="outlined" startIcon={<ReplyIcon />} onClick={startReply}>Reply</Button>
                <Button variant="outlined" color="inherit" startIcon={<ForwardIcon />} onClick={startForward}>Forward</Button>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* Compose FAB */}
      <Button
        variant="contained" disableElevation startIcon={<EditOutlinedIcon />}
        onClick={() => currentMb && setCompose({ to: "", cc: "", subject: "", body: "" })}
        disabled={!currentMb}
        sx={{ position: "fixed", right: 20, bottom: 20, borderRadius: 7, px: 2.5, py: 1.25, boxShadow: 3, zIndex: 1200 }}
      >
        Compose
      </Button>

      {compose && currentMb && <Compose mailbox={currentMb} draft={compose} onClose={() => setCompose(null)} onSent={() => { setCompose(null); }} />}
      {sigOpen && currentMb && <SignatureDialog mailbox={currentMb} onClose={() => setSigOpen(false)} onSaved={() => { setSigOpen(false); qc.invalidateQueries({ queryKey: ["mailboxes"] }); }} />}
      <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)} />
    </Box>
  );
}

function ThreadRow({ t, active, onClick }: { t: ThreadSummary; active: boolean; onClick: () => void }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex", gap: 1.25, px: 2, py: 1.25, cursor: "pointer",
        borderBottom: `1px solid ${tokens.divider}`,
        bgcolor: active ? tokens.hover : t.unread ? "background.paper" : "transparent",
        "&:hover": { bgcolor: tokens.hover },
      }}
    >
      <Avatar sx={{ width: 36, height: 36, fontSize: 15, bgcolor: tokens.primary, color: tokens.onPrimary }}>{initials(t.who.name)}</Avatar>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <Typography noWrap sx={{ fontSize: 14, fontWeight: t.unread ? 700 : 500, color: tokens.ink, flex: 1 }}>
            {t.who.name}{t.count > 1 ? ` (${t.count})` : ""}
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: t.unread ? tokens.primary : tokens.ink3, whiteSpace: "nowrap", fontWeight: t.unread ? 700 : 400 }}>{timeShort(t.date)}</Typography>
        </Box>
        <Typography noWrap sx={{ fontSize: 13.5, fontWeight: t.unread ? 600 : 400, color: tokens.ink }}>{t.subject}</Typography>
        <Typography noWrap sx={{ fontSize: 12.5, color: tokens.ink3 }}>{t.snippet}</Typography>
      </Box>
      {t.unread && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: tokens.primary, mt: 1 }} />}
    </Box>
  );
}

function MessageBlock({ m }: { m: MessageFull }) {
  const [open, setOpen] = useState(true);
  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: 1, mb: 1.5, bgcolor: "background.paper" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.25, cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <Avatar sx={{ width: 34, height: 34, fontSize: 14, bgcolor: tokens.primary, color: tokens.onPrimary }}>{initials(m.from.name)}</Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600 }}>{m.from.name} <Typography component="span" sx={{ fontSize: 12.5, color: tokens.ink3 }}>&lt;{m.from.email}&gt;</Typography></Typography>
          <Typography noWrap sx={{ fontSize: 12, color: tokens.ink3 }}>to {m.to}</Typography>
        </Box>
        <Typography sx={{ fontSize: 12, color: tokens.ink3, whiteSpace: "nowrap" }}>{timeShort(m.date)}</Typography>
      </Box>
      {open && (
        <Box sx={{ px: 2, pb: 2 }}>
          <Divider sx={{ mb: 1 }} />
          <Body html={m.html} />
          {m.attachments.length > 0 && (
            <Box sx={{ mt: 1.5, display: "flex", flexWrap: "wrap", gap: 1 }}>
              {m.attachments.map((a) => (
                <Box key={a.attachmentId} sx={{ fontSize: 12.5, color: tokens.ink2, border: `1px solid ${tokens.divider}`, borderRadius: 1, px: 1, py: 0.5 }}>📎 {a.filename}</Box>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
