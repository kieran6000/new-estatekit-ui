import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppBar, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
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
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import Draw from "@mui/icons-material/DriveFileRenameOutline";
import { tokens } from "../theme";
import { useSnack } from "../hooks/useSnack";
import {
  getAttachment, getThread, listMailboxes, listThreads, MailNotConnected, modifyThread, saveSignature, sendMail,
  type Folder, type Mailbox, type MessageFull, type ThreadSummary, type Upload,
} from "../api/mail";

const LAST_MB = "ek.mail.mailbox";
const UNDO_MS = 4000; // window to cancel a send before it actually goes
const MAX_ATTACH = 22 * 1024 * 1024; // keep total raw size under Gmail's limit

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
const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

// ── Sender avatar: real Gravatar photo when the person has one, else a tidy
// coloured monogram (same idea as WhatsApp/Gmail). No blue, per house style. ──
const AV_COLORS = ["#5b6b5a", "#7a5c48", "#6b5b7a", "#4f6d6a", "#7a6b4f", "#6a5151", "#4f6a52", "#605a6e"];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.trim().toLowerCase()));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function SenderAvatar({ name, email, size = 36 }: { name: string; email: string; size?: number }) {
  const [src, setSrc] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    if (!email) { setSrc(undefined); return; }
    sha256hex(email).then((h) => { if (live) setSrc(`https://www.gravatar.com/avatar/${h}?s=${size * 2}&d=404`); });
    return () => { live = false; };
  }, [email, size]);
  return (
    <Avatar
      src={src}
      imgProps={{ onError: () => setSrc(undefined), referrerPolicy: "no-referrer" }}
      sx={{ width: size, height: size, fontSize: size * 0.42, bgcolor: avatarColor(email || name), color: "#fff" }}
    >
      {initials(name)}
    </Avatar>
  );
}

// ── Attachments ─────────────────────────────────────────────────────────────
function b64ToBytes(d: string): Uint8Array {
  const s = d.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
const isViewable = (mime: string) => /^(application\/pdf|image\/(png|jpe?g|gif|webp|bmp))/i.test(mime);
function attIcon(mime: string) {
  if (/pdf/i.test(mime)) return <PictureAsPdfOutlinedIcon sx={{ fontSize: 18, color: "#b3261e" }} />;
  if (/^image\//i.test(mime)) return <ImageOutlinedIcon sx={{ fontSize: 18, color: tokens.ink2 }} />;
  return <InsertDriveFileOutlinedIcon sx={{ fontSize: 18, color: tokens.ink2 }} />;
}

/** A received attachment: click to open (PDF/image in a tab) or download. */
function AttachmentChip({ mailbox, messageId, att }: { mailbox: string; messageId: string; att: MessageFull["attachments"][number] }) {
  const [busy, setBusy] = useState(false);
  const snack = useSnack();
  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await getAttachment(mailbox, messageId, att.attachmentId);
      const blob = new Blob([b64ToBytes(data)], { type: att.mimeType || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      if (isViewable(att.mimeType)) {
        window.open(url, "_blank", "noopener");
      } else {
        const a = document.createElement("a");
        a.href = url; a.download = att.filename || "attachment"; a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      snack("Couldn't open that file. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box
      onClick={open}
      role="button"
      sx={{
        display: "inline-flex", alignItems: "center", gap: 0.75, maxWidth: 260, cursor: "pointer",
        border: `1px solid ${tokens.divider}`, borderRadius: 1.5, px: 1, py: 0.6, bgcolor: "background.paper",
        "&:hover": { bgcolor: tokens.hover },
      }}
    >
      {busy ? <CircularProgress size={16} /> : attIcon(att.mimeType)}
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 12.5, color: tokens.ink, lineHeight: 1.2 }}>{att.filename || "attachment"}</Typography>
        <Typography sx={{ fontSize: 10.5, color: tokens.ink3, lineHeight: 1.2 }}>
          {isViewable(att.mimeType) ? "Open" : "Download"}{att.size ? ` · ${fmtSize(att.size)}` : ""}
        </Typography>
      </Box>
    </Box>
  );
}

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
export interface Draft { to: string; cc: string; subject: string; body: string; threadId?: string; inReplyTo?: string; references?: string; quoted?: string; attachments?: Upload[]; }

function readFile(file: File): Promise<Upload & { size: number }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read failed"));
    r.onload = () => {
      const res = String(r.result);
      resolve({ filename: file.name, mimeType: file.type || "application/octet-stream", data: res.slice(res.indexOf(",") + 1), size: file.size });
    };
    r.readAsDataURL(file);
  });
}

function Compose({ mailbox, draft, onClose, onSend }: { mailbox: Mailbox; draft: Draft; onClose: () => void; onSend: (d: Draft) => void }) {
  const [d, setD] = useState(draft);
  const [showCc, setShowCc] = useState(!!draft.cc);
  const [atts, setAtts] = useState<(Upload & { size: number })[]>(() => (draft.attachments ?? []).map((a) => ({ ...a, size: b64ToBytes(a.data).length })));
  const [attErr, setAttErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const snack = useSnack();

  const totalSize = atts.reduce((n, a) => n + a.size, 0);

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setAttErr("");
    try {
      const read = await Promise.all([...files].map(readFile));
      const next = [...atts, ...read];
      if (next.reduce((n, a) => n + a.size, 0) > MAX_ATTACH) { setAttErr("That's over the 22 MB limit. Remove a file or send a link instead."); return; }
      setAtts(next);
    } catch {
      snack("Couldn't attach that file.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = () => {
    const html = `<div>${esc(d.body).replace(/\n/g, "<br>")}</div>${sigHtml(mailbox.signature)}${d.quoted ? `<br><br>${d.quoted}` : ""}`;
    onSend({ ...d, body: html, attachments: atts.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })) });
  };

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
        {atts.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {atts.map((a, i) => (
              <Chip key={i} icon={attIcon(a.mimeType)} label={`${a.filename} · ${fmtSize(a.size)}`} onDelete={() => setAtts(atts.filter((_, j) => j !== i))}
                deleteIcon={<CloseIcon />} sx={{ maxWidth: 240, "& .MuiChip-label": { fontSize: 12.5 } }} />
            ))}
            <Typography sx={{ fontSize: 11, color: tokens.ink3, alignSelf: "center", ml: 0.5 }}>{fmtSize(totalSize)} total</Typography>
          </Box>
        )}
        {attErr && <Typography sx={{ fontSize: 12.5, color: tokens.red }}>{attErr}</Typography>}
        {mailbox.signature.trim() && (
          <Typography sx={{ fontSize: 12, color: tokens.ink3, whiteSpace: "pre-wrap", borderTop: `1px solid ${tokens.divider}`, pt: 1 }}>
            — {mailbox.signature}
          </Typography>
        )}
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Tooltip title="Attach a file"><IconButton onClick={() => fileRef.current?.click()}><AttachFileIcon /></IconButton></Tooltip>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} color="inherit">Discard</Button>
        <Button variant="contained" disableElevation disabled={!d.to.trim()} onClick={submit}>Send</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Signature editor ────────────────────────────────────────────────────────
function SignatureDialog({ mailbox, onClose, onSaved }: { mailbox: Mailbox; onClose: () => void; onSaved: () => void }) {
  const [sig, setSig] = useState(mailbox.signature);
  const snack = useSnack();
  const save = useMutation({
    mutationFn: () => saveSignature(mailbox.email, sig),
    onSuccess: () => { snack("Signature saved."); onSaved(); },
    onError: () => snack("Couldn't save the signature. Try again."),
  });
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
  const snack = useSnack();
  const [params, setParams] = useSearchParams();
  const [mailbox, setMailbox] = useState<string>(() => params.get("box") || localStorage.getItem(LAST_MB) || "");
  const [folder, setFolder] = useState<Folder>("inbox");
  const [selected, setSelected] = useState<string | null>(() => params.get("thread"));
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState<Draft | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [menuEl, setMenuEl] = useState<null | HTMLElement>(null);
  const sendTimer = useRef<number | null>(null);

  const mailboxes = useQuery({ queryKey: ["mailboxes"], queryFn: listMailboxes, staleTime: 5 * 60_000 });
  const mbList = mailboxes.data ?? [];
  const currentMb = useMemo(() => mbList.find((m) => m.email === mailbox) ?? mbList[0], [mbList, mailbox]);

  useEffect(() => {
    if (!mailbox && mbList.length) setMailbox(mbList[0].email);
  }, [mbList, mailbox]);
  useEffect(() => { if (currentMb) localStorage.setItem(LAST_MB, currentMb.email); }, [currentMb]);

  // Keep the URL in sync so a mailbox + thread can be deep-linked / shared.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (currentMb) next.set("box", currentMb.email); else next.delete("box");
    if (selected) next.set("thread", selected); else next.delete("thread");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMb, selected]);

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
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["mailThreads"] });
      setSelected(null);
      snack(v.change.trash ? "Moved to Trash." : v.change.archive ? "Archived." : "Done.");
    },
    onError: () => snack("That didn't go through. Try again."),
  });

  const openThread = (id: string) => { setSelected(id); qc.invalidateQueries({ queryKey: ["mailThreads"] }); };

  // Send with a Gmail-style undo window: hold the send for a few seconds and
  // let the user take it back before it actually leaves.
  const reallySend = (d: Draft) => {
    if (!currentMb) return;
    sendMail(currentMb.email, {
      to: d.to, cc: d.cc || undefined, subject: d.subject || "(no subject)",
      html: d.body, threadId: d.threadId, inReplyTo: d.inReplyTo, references: d.references, attachments: d.attachments,
    })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["mailThreads"] });
        if (d.threadId) qc.invalidateQueries({ queryKey: ["mailThread", currentMb.email, d.threadId] });
        snack("Sent.");
      })
      .catch((e) => { snack(`Couldn't send: ${(e as Error).message}. Your draft is back.`); setCompose(d); });
  };
  const handleSend = (d: Draft) => {
    setCompose(null);
    if (sendTimer.current) window.clearTimeout(sendTimer.current);
    sendTimer.current = window.setTimeout(() => { sendTimer.current = null; reallySend(d); }, UNDO_MS);
    snack("Sending…", () => {
      if (sendTimer.current) { window.clearTimeout(sendTimer.current); sendTimer.current = null; }
      setCompose(d); // bring the draft back, nothing sent
    }, "Undo");
  };

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
        <Tabs value={folder} onChange={(_e, v) => { setFolder(v); setSelected(null); }} variant="scrollable" scrollButtons={false} sx={{ minHeight: 44 }}>
          <Tab value="inbox" label="Inbox" sx={{ minHeight: 44 }} />
          <Tab value="sent" label="Sent" sx={{ minHeight: 44 }} />
          <Tab value="archive" label="Archive" sx={{ minHeight: 44 }} />
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
          {threads.isError && !notConnected && <Box sx={{ p: 3 }}><Typography sx={{ fontSize: 13, color: tokens.red }}>Couldn't load this folder. Pull to refresh or try again.</Typography></Box>}
          {threads.data?.threads.length === 0 && <Box sx={{ p: 4, textAlign: "center" }}><Typography sx={{ fontSize: 14, color: tokens.ink3 }}>Nothing here.</Typography></Box>}
          {threads.data?.threads.map((t) => (
            <ThreadRow key={t.id} t={t} active={t.id === selected} onClick={() => openThread(t.id)} />
          ))}
        </Box>

        {/* Reading pane */}
        <Box sx={{ flex: 1, display: { xs: showList ? "none" : "block", md: "block" }, overflowY: "auto" }}>
          {!selected && <Box sx={{ display: { xs: "none", md: "flex" }, height: "100%", alignItems: "center", justifyContent: "center" }}><Typography sx={{ color: tokens.ink3, fontSize: 14 }}>Select an email to read</Typography></Box>}
          {selected && thread.isLoading && <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress size={24} /></Box>}
          {selected && thread.isError && <Box sx={{ p: 3 }}><Typography sx={{ fontSize: 13, color: tokens.red }}>Couldn't open this email. Go back and try again.</Typography></Box>}
          {selected && thread.data && currentMb && (
            <Box sx={{ maxWidth: 820, mx: "auto", p: { xs: 1.5, md: 3 } }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: 20, fontWeight: 500, flex: 1 }}>{thread.data.subject}</Typography>
                <Tooltip title="Archive"><IconButton size="small" onClick={() => act.mutate({ id: selected, change: { archive: true } })}><ArchiveOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Delete"><IconButton size="small" onClick={() => act.mutate({ id: selected, change: { trash: true } })}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
              </Box>
              {thread.data.messages.map((m) => <MessageBlock key={m.id} m={m} mailbox={currentMb.email} />)}
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

      {compose && currentMb && <Compose mailbox={currentMb} draft={compose} onClose={() => setCompose(null)} onSend={handleSend} />}
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
      <SenderAvatar name={t.who.name} email={t.who.email} size={36} />
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

function MessageBlock({ m, mailbox }: { m: MessageFull; mailbox: string }) {
  const [open, setOpen] = useState(true);
  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: 1, mb: 1.5, bgcolor: "background.paper" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.25, cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <SenderAvatar name={m.from.name} email={m.from.email} size={34} />
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
                <AttachmentChip key={a.attachmentId} mailbox={mailbox} messageId={m.id} att={a} />
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
