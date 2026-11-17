import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppBar, Autocomplete, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, InputBase, MenuItem, Select, Tab, Tabs, TextField, Toolbar, Tooltip, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import SearchIcon from "@mui/icons-material/Search";
import ReplyIcon from "@mui/icons-material/Reply";
import ReplyAllIcon from "@mui/icons-material/ReplyAll";
import ForwardIcon from "@mui/icons-material/Forward";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import MoveToInboxOutlinedIcon from "@mui/icons-material/MoveToInboxOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import SignatureIcon from "@mui/icons-material/DriveFileRenameOutline";
import DoneIcon from "@mui/icons-material/Done";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import TouchAppOutlinedIcon from "@mui/icons-material/TouchAppOutlined";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatClearIcon from "@mui/icons-material/FormatClear";
import InsertLinkIcon from "@mui/icons-material/InsertLink";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import { tokens } from "../theme";
import { useSnack } from "../hooks/useSnack";
import { MailDraftPill } from "../components/MailBits";
import { clearDraft, getDraft, isEmptyDraft, saveDraft } from "../lib/mailDraft";
import { listClients } from "../api/clients";
import { emailMetrics, listWorkflowEmails, WorkflowEmailsNotSetUp, type SentEmail } from "../api/workflowEmails";
import {
  getAttachment, getThread, listMailboxes, listThreads, MailNotConnected, modifyThread, saveSignature, sendMail,
  type Folder, type Inline, type Mailbox, type MessageFull, type ThreadSummary, type Upload,
} from "../api/mail";

const LAST_MB = "ek.mail.mailbox";
const HIDE_NEWS = "ek.mail.hideNewsletters";
const UNDO_MS = 4000; // window to cancel a send before it actually goes
const MAX_ATTACH = 22 * 1024 * 1024; // keep total raw size under Gmail's limit

/** Inbox / Sent / Archive / All mail come from Gmail; "Automated" is our own
 *  workflow email log, shown in the same place so there's one Mail tab only. */
type MailTab = Folder | "auto";

function timeShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = (now.getTime() - d.getTime()) / 86400000;
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function timeFull(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
const initials = (s: string) => (s.trim()[0] || "?").toUpperCase();
const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
const isHtml = (s: string) => /<[a-z][\s\S]*>/i.test(s);
const sigHtml = (sig: string) => {
  const t = sig.trim();
  if (!t) return "";
  // A signature saved with the rich editor is already html; an older plain-text
  // one keeps its line breaks.
  return `<br><br><div>${isHtml(t) ? t : esc(t).replace(/\n/g, "<br>")}</div>`;
};
const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const plainText = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const looksLikeEmail = (s: string) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s);

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
      sx={{ width: size, height: size, fontSize: size * 0.42, bgcolor: avatarColor(email || name), color: "#fff", flexShrink: 0 }}
    >
      {initials(name)}
    </Avatar>
  );
}

// ── Attachments ─────────────────────────────────────────────────────────────
function b64ToBytes(d: string): Uint8Array {
  const bin = atob(d.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, ""));
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

/** A received attachment: tap to open (PDF/image in a tab) or download. */
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
        display: "inline-flex", alignItems: "center", gap: 0.75, maxWidth: 260, cursor: "pointer", minHeight: 44,
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

// ── Reading pane: one email body, shown in full ─────────────────────────────
// The body goes in an iframe so a stranger's css can't leak into the app. It is
// sandboxed WITHOUT allow-scripts, so nothing in the email can run; we do keep
// allow-same-origin, because that is what lets us measure the real height and
// grow the frame to fit. Without it the frame stays short and the email ends up
// in a little scroll box — which is exactly what we don't want.
const BODY_CSS = `
  html{overflow:hidden}
  body{margin:0;padding:0;overflow-x:auto;overflow-y:hidden;-webkit-text-size-adjust:100%;
       font-family:Roboto,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#202124;background:#fff;
       overflow-wrap:anywhere}
  img{max-width:100%;height:auto}
  a{color:#1a5fb4}
  blockquote{margin:0 0 0 .8ex;border-left:2px solid #d4d4d4;padding-left:1ex;color:#5f6368}
  pre{white-space:pre-wrap;word-break:break-word}
  table{max-width:100%}
`;

function Body({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const cleanup = useRef<(() => void) | null>(null);

  const fit = useCallback(() => {
    const f = ref.current;
    let d: Document | null = null;
    try { d = f?.contentWindow?.document ?? null; } catch { d = null; }
    if (!f || !d?.body) return;
    const h = Math.max(d.documentElement.scrollHeight, d.body.scrollHeight, 28);
    if (Math.abs(parseFloat(f.style.height || "0") - h) > 1) f.style.height = `${h}px`;
  }, []);

  const onLoad = () => {
    cleanup.current?.();
    fit();
    let d: Document | null = null;
    try { d = ref.current?.contentWindow?.document ?? null; } catch { d = null; }
    if (!d) return;
    // Pictures land after the page loads and make the body taller, and remote
    // css can reflow it later still — so re-measure on every one of those.
    const imgs = Array.from(d.images);
    imgs.forEach((i) => { i.addEventListener("load", fit); i.addEventListener("error", fit); });
    let ro: ResizeObserver | null = null;
    try { ro = new ResizeObserver(fit); ro.observe(d.body); ro.observe(d.documentElement); } catch { /* no observer here */ }
    const timers = [50, 200, 600, 1500].map((t) => window.setTimeout(fit, t));
    cleanup.current = () => {
      imgs.forEach((i) => { i.removeEventListener("load", fit); i.removeEventListener("error", fit); });
      ro?.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
    };
  };

  useEffect(() => () => cleanup.current?.(), []);
  useEffect(() => {
    // A narrower window means a taller body.
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  return (
    <iframe
      ref={ref}
      onLoad={onLoad}
      title="Message"
      sandbox="allow-same-origin"
      scrolling="no"
      srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BODY_CSS}</style></head><body>${html}</body></html>`}
      style={{ width: "100%", border: 0, display: "block", height: 80, background: "#fff", colorScheme: "light" }}
    />
  );
}

// ── Delivery ticks, read the same way as WhatsApp's ─────────────────────────
function Ticks({ delivered, opened, clicked, bounced }: { delivered: boolean; opened: boolean; clicked: boolean; bounced: boolean }) {
  if (bounced) {
    return (
      <Tooltip title="It didn't arrive. The address bounced, or they marked it as spam.">
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, color: tokens.red }}>
          <ReportProblemOutlinedIcon sx={{ fontSize: 16 }} />
          <Typography sx={{ fontSize: 11.5, fontWeight: 600 }}>Didn't arrive</Typography>
        </Box>
      </Tooltip>
    );
  }
  const word = clicked ? "Tapped a link" : opened ? "Opened" : delivered ? "Delivered" : "Sent";
  const help = clicked
    ? "They opened it and tapped a link inside."
    : opened
      ? "They opened it."
      : delivered
        ? "It reached their inbox. No sign they've opened it yet."
        : "It left our side. Waiting for the delivery report.";
  const lit = opened || clicked;
  return (
    <Tooltip title={help}>
      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, color: lit ? tokens.primary : tokens.ink3 }}>
        {delivered || lit ? <DoneAllIcon sx={{ fontSize: 16 }} /> : <DoneIcon sx={{ fontSize: 16 }} />}
        {clicked && <TouchAppOutlinedIcon sx={{ fontSize: 14 }} />}
        <Typography sx={{ fontSize: 11.5, fontWeight: lit ? 600 : 400 }}>{word}</Typography>
      </Box>
    </Tooltip>
  );
}

// ── Rich editor: same feel as the notes box on Overview ─────────────────────
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
function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read failed"));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });
}

/** Pictures in the body travel with the mail as `cid:` parts, so they still
 *  show for the reader long after any link to our storage would have expired. */
function extractInlineImages(html: string): { html: string; inline: Inline[] } {
  const inline: Inline[] = [];
  const stamp = Date.now();
  const out = html.replace(/src="data:([^;"]+);base64,([^"]*)"/g, (_m, mime: string, data: string) => {
    const n = inline.length + 1;
    const cid = `ekimg${n}.${stamp}@estatekit.co`;
    const ext = (mime.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "").slice(0, 4);
    inline.push({ cid, filename: `image${n}.${ext}`, mimeType: mime, data });
    return `src="cid:${cid}"`;
  });
  return { html: out, inline };
}

function ToolBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip title={title}>
      <IconButton size="small" aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick} sx={{ width: 34, height: 34, color: tokens.ink2 }}>
        {children}
      </IconButton>
    </Tooltip>
  );
}

function MailEditor({ initial, placeholder, onChange, minHeight = 190, autoFocus }: {
  initial: string; placeholder: string; onChange: (html: string) => void; minHeight?: number; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = useState(!plainText(initial) && !/<img/i.test(initial));
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const snack = useSnack();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = initial;
    if (autoFocus) {
      el.focus();
      // Caret at the start, Gmail-style: your words go above the quoted mail.
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => {
    const html = ref.current?.innerHTML ?? "";
    setEmpty(!plainText(html) && !/<img/i.test(html));
    onChange(html);
  }, [onChange]);

  const cmd = (c: string, v?: string) => {
    ref.current?.focus();
    try { document.execCommand(c, false, v); } catch { /* older browser */ }
    emit();
  };

  const insert = (html: string) => {
    ref.current?.focus();
    try { document.execCommand("insertHTML", false, html); } catch { /* older browser */ }
    emit();
  };

  const addPictures = async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []).filter((f) => /^image\//i.test(f.type));
    if (!list.length) return;
    try {
      for (const f of list) {
        if (f.size > 8 * 1024 * 1024) { snack("That picture is too big to put in the email. Attach it as a file instead."); continue; }
        insert(`<img src="${await dataUrl(f)}" style="max-width:100%;height:auto" alt="">`);
      }
    } catch {
      snack("Couldn't add that picture.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const addLink = () => {
    const url = linkUrl.trim();
    setLinkOpen(false);
    setLinkUrl("");
    if (!url) return;
    const href = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) cmd("createLink", href);
    else insert(`<a href="${href.replace(/"/g, "&quot;")}">${esc(href)}</a> `);
  };

  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: 1.5, bgcolor: "background.paper" }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.25, px: 0.5, py: 0.25, borderBottom: `1px solid ${tokens.divider}` }}>
        <ToolBtn title="Bold" onClick={() => cmd("bold")}><FormatBoldIcon sx={{ fontSize: 19 }} /></ToolBtn>
        <ToolBtn title="Italic" onClick={() => cmd("italic")}><FormatItalicIcon sx={{ fontSize: 19 }} /></ToolBtn>
        <ToolBtn title="Underline" onClick={() => cmd("underline")}><FormatUnderlinedIcon sx={{ fontSize: 19 }} /></ToolBtn>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25, my: 0.75 }} />
        <ToolBtn title="Bullet list" onClick={() => cmd("insertUnorderedList")}><FormatListBulletedIcon sx={{ fontSize: 19 }} /></ToolBtn>
        <ToolBtn title="Numbered list" onClick={() => cmd("insertOrderedList")}><FormatListNumberedIcon sx={{ fontSize: 19 }} /></ToolBtn>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25, my: 0.75 }} />
        <ToolBtn title="Add a link" onClick={() => setLinkOpen(true)}><InsertLinkIcon sx={{ fontSize: 19 }} /></ToolBtn>
        <ToolBtn title="Put a picture in the message" onClick={() => fileRef.current?.click()}><ImageOutlinedIcon sx={{ fontSize: 19 }} /></ToolBtn>
        <ToolBtn title="Remove formatting" onClick={() => cmd("removeFormat")}><FormatClearIcon sx={{ fontSize: 19 }} /></ToolBtn>
        <Box sx={{ flex: 1 }} />
        <ToolBtn title="Undo" onClick={() => cmd("undo")}><UndoIcon sx={{ fontSize: 19 }} /></ToolBtn>
        <ToolBtn title="Redo" onClick={() => cmd("redo")}><RedoIcon sx={{ fontSize: 19 }} /></ToolBtn>
      </Box>
      <Box sx={{ position: "relative" }}>
        {empty && (
          <Typography sx={{ position: "absolute", top: 12, left: 12, fontSize: 14, color: tokens.ink3, pointerEvents: "none" }}>{placeholder}</Typography>
        )}
        <Box
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
          onInput={emit}
          onBlur={emit}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.files ?? []).filter((f) => /^image\//i.test(f.type));
            if (files.length) { e.preventDefault(); void addPictures(files); }
          }}
          sx={{
            minHeight, maxHeight: { xs: "none", sm: 420 }, overflowY: { xs: "visible", sm: "auto" },
            px: 1.5, py: 1.5, fontSize: 14, lineHeight: 1.6, color: tokens.ink, outline: "none",
            "& img": { maxWidth: "100%", height: "auto" },
            "& a": { color: tokens.primary },
            "& ul, & ol": { pl: 3, my: 0.5 },
            "& blockquote": { m: 0, ml: 1, pl: 1.5, borderLeft: `2px solid ${tokens.divider}`, color: tokens.ink3 },
          }}
        />
      </Box>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addPictures(e.target.files)} />
      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontSize: 16, fontWeight: 600 }}>Add a link</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth size="small" label="Web address" placeholder="estatekit.co"
            value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
            slotProps={{ htmlInput: { inputMode: "url", autoCapitalize: "none", spellCheck: false } }}
          />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setLinkOpen(false)}>Cancel</Button>
          <Button variant="contained" disableElevation onClick={addLink}>Add</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ── Who you can write to ────────────────────────────────────────────────────
interface Person { name: string; email: string; inactive: boolean }

function useDirectory(): Person[] {
  const { data } = useQuery({ queryKey: ["clients"], queryFn: listClients, staleTime: 5 * 60_000, retry: false });
  return useMemo(
    () => (data ?? [])
      .filter((c) => !!c.email)
      .map((c) => ({ name: (c.display_name || c.email || "").trim(), email: c.email as string, inactive: !!c.deactivated_at })),
    [data],
  );
}

const addrOf = (p: Person) => `${p.name.replace(/[",<>]/g, " ").replace(/\s+/g, " ").trim()} <${p.email}>`;
const emailIn = (token: string) => (token.match(/<([^>]+)>/)?.[1] ?? token).trim();

function RecipientField({ label, value, onChange, people, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; people: Person[]; autoFocus?: boolean;
}) {
  const chips = useMemo(() => value.split(",").map((s) => s.trim()).filter(Boolean), [value]);
  const byAddr = useMemo(() => new Map(people.map((p) => [addrOf(p), p])), [people]);
  const options = useMemo(() => people.map(addrOf), [people]);
  const bad = chips.filter((t) => !looksLikeEmail(emailIn(t)));
  return (
    <Autocomplete
      multiple
      freeSolo
      autoHighlight
      options={options}
      value={chips}
      onChange={(_e, v) => onChange((v as string[]).join(", "))}
      filterSelectedOptions
      renderOption={(props, option) => {
        const p = byAddr.get(option);
        const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
        return (
          <Box component="li" key={key} {...rest} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 500 }}>{p?.name ?? option}</Typography>
              <Typography noWrap sx={{ fontSize: 12, color: tokens.ink3 }}>{p?.email}</Typography>
            </Box>
            {p?.inactive && <Chip size="small" label="Stopped" sx={{ height: 20, fontSize: 10.5, bgcolor: tokens.hover }} />}
          </Box>
        );
      }}
      renderTags={(vals, getTagProps) =>
        vals.map((v, i) => {
          const { key, ...rest } = getTagProps({ index: i });
          const p = byAddr.get(v);
          const ok = looksLikeEmail(emailIn(v));
          return (
            <Chip
              key={key} {...rest} size="small"
              label={p?.name ?? (ok ? emailIn(v) : v)}
              sx={{ maxWidth: 220, bgcolor: ok ? undefined : tokens.redTint, border: ok ? undefined : `1px solid ${tokens.redBorder}` }}
            />
          );
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          autoFocus={autoFocus}
          size="small"
          label={label}
          placeholder={chips.length ? "" : "Name or email address"}
          error={bad.length > 0}
          helperText={bad.length > 0 ? `${bad[0]} doesn't look like an email address.` : undefined}
          slotProps={{ htmlInput: { ...params.inputProps, inputMode: "email", autoCapitalize: "none", spellCheck: false } }}
        />
      )}
    />
  );
}

// ── Compose / reply ─────────────────────────────────────────────────────────
export interface Draft {
  to: string; cc: string; subject: string; body: string;
  threadId?: string; inReplyTo?: string; references?: string; quoted?: string;
  attachments?: Upload[]; inline?: Inline[];
  /** Set on a reply/forward so the dialog can say plainly what it answers. */
  replyTo?: { name: string; email: string; subject: string };
  /** True when the body is already html (a restored draft), not plain text. */
  rich?: boolean;
  hadFiles?: boolean;
}

function Compose({ mailbox, draft, people, onClose, onSend }: {
  mailbox: Mailbox; draft: Draft; people: Person[]; onClose: () => void; onSend: (d: Draft) => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const [d, setD] = useState(draft);
  const [showCc, setShowCc] = useState(!!draft.cc);
  const [showQuoted, setShowQuoted] = useState(false);
  const [atts, setAtts] = useState<(Upload & { size: number })[]>(() => (draft.attachments ?? []).map((a) => ({ ...a, size: b64ToBytes(a.data).length })));
  const [attErr, setAttErr] = useState("");
  const [confirmBin, setConfirmBin] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const snack = useSnack();

  const totalSize = atts.reduce((n, a) => n + a.size, 0);
  const recipients = d.to.split(",").map((s) => emailIn(s)).filter(Boolean);
  const canSend = recipients.length > 0 && recipients.every(looksLikeEmail);

  // Keep the unfinished email safe: saved as you type, so leaving the tab,
  // opening a client or closing the browser never loses it.
  useEffect(() => {
    const t = window.setTimeout(() => {
      saveDraft({
        mailbox: mailbox.email, to: d.to, cc: d.cc, subject: d.subject, body: d.body,
        threadId: d.threadId, inReplyTo: d.inReplyTo, references: d.references, quoted: d.quoted,
        replyTo: d.replyTo, hadFiles: atts.length > 0,
      });
      setSaved(!isEmptyDraft(d));
    }, 500);
    return () => window.clearTimeout(t);
  }, [d, atts.length, mailbox.email]);

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setAttErr("");
    try {
      const read = await Promise.all([...files].map(readFile));
      const next = [...atts, ...read];
      if (next.reduce((n, a) => n + a.size, 0) > MAX_ATTACH) {
        setAttErr("That's over the 22 MB limit. Take a file off, or send a link instead.");
        return;
      }
      setAtts(next);
    } catch {
      snack("Couldn't attach that file.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = () => {
    const { html: bodyHtml, inline } = extractInlineImages(d.body);
    const html = `<div>${bodyHtml}</div>${sigHtml(mailbox.signature)}${d.quoted ? `<br>${d.quoted}` : ""}`;
    onSend({
      ...d, body: html, rich: true,
      attachments: atts.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })),
      inline: inline.length ? inline : undefined,
    });
  };

  const bin = () => {
    if (isEmptyDraft(d) && atts.length === 0) { clearDraft(); onClose(); return; }
    setConfirmBin(true);
  };

  const title = d.replyTo ? `Reply to ${d.replyTo.name || d.replyTo.email}` : d.quoted ? "Forward" : "New email";

  return (
    <Dialog open onClose={bin} fullWidth maxWidth="sm" fullScreen={phone} PaperProps={{ sx: { borderRadius: phone ? 0 : 1.5 } }}>
      <DialogTitle sx={{ fontSize: 16, fontWeight: 600, py: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</Box>
        <IconButton size="small" onClick={bin} aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        {/* Exactly what this answers — so nobody has to guess. */}
        {d.replyTo && (
          <Box sx={{ bgcolor: tokens.primaryBg, border: `1px solid ${tokens.primaryBorder}`, borderRadius: 1.5, px: 1.25, py: 1 }}>
            <Typography sx={{ fontSize: 12, color: tokens.ink3 }}>You're replying to</Typography>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: tokens.ink }}>{d.replyTo.name || d.replyTo.email}</Typography>
            <Typography noWrap sx={{ fontSize: 12.5, color: tokens.ink2 }}>{d.replyTo.subject}</Typography>
            {d.quoted && (
              <Button size="small" onClick={() => setShowQuoted((v) => !v)} sx={{ mt: 0.5, px: 0.5, fontSize: 12, textTransform: "none" }}>
                {showQuoted ? "Hide their email" : "Show their email"}
              </Button>
            )}
            {showQuoted && d.quoted && (
              <Box sx={{ mt: 0.5, maxHeight: 240, overflowY: "auto", borderRadius: 1, bgcolor: "#fff" }}>
                <Body html={d.quoted} />
              </Box>
            )}
          </Box>
        )}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ fontSize: 13, color: tokens.ink3, width: 40, flexShrink: 0 }}>From</Typography>
          <Typography noWrap sx={{ fontSize: 13.5, color: tokens.ink }}>{mailbox.display_name} &lt;{mailbox.email}&gt;</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <RecipientField label="To" value={d.to} onChange={(v) => setD({ ...d, to: v })} people={people} autoFocus={!d.to} />
          </Box>
          {!showCc && <Button size="small" sx={{ mt: 0.5 }} onClick={() => setShowCc(true)}>Cc</Button>}
        </Box>
        {showCc && <RecipientField label="Cc" value={d.cc} onChange={(v) => setD({ ...d, cc: v })} people={people} />}
        <TextField fullWidth size="small" label="Subject" value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} />
        <MailEditor
          initial={d.rich ? d.body : esc(d.body).replace(/\n/g, "<br>")}
          placeholder="Write your message…"
          onChange={(html) => setD((prev) => ({ ...prev, body: html, rich: true }))}
          autoFocus={!!d.to}
        />
        {atts.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {atts.map((a, i) => (
              <Chip
                key={i} icon={attIcon(a.mimeType)} label={`${a.filename} · ${fmtSize(a.size)}`}
                onDelete={() => setAtts(atts.filter((_, j) => j !== i))} deleteIcon={<CloseIcon />}
                sx={{ maxWidth: 240, "& .MuiChip-label": { fontSize: 12.5 } }}
              />
            ))}
            <Typography sx={{ fontSize: 11, color: tokens.ink3, alignSelf: "center", ml: 0.5 }}>{fmtSize(totalSize)} total</Typography>
          </Box>
        )}
        {d.hadFiles && atts.length === 0 && (
          <Typography sx={{ fontSize: 12.5, color: tokens.amber }}>
            This draft had files attached. Files aren't kept with a saved draft — attach them again before you send.
          </Typography>
        )}
        {attErr && <Typography sx={{ fontSize: 12.5, color: tokens.red }}>{attErr}</Typography>}
        {mailbox.signature.trim() && (
          <Box sx={{ borderTop: `1px solid ${tokens.divider}`, pt: 1 }}>
            <Typography sx={{ fontSize: 11, color: tokens.ink3, mb: 0.25 }}>Your signature goes on the bottom</Typography>
            <Box sx={{ fontSize: 12.5, color: tokens.ink3 }} dangerouslySetInnerHTML={{ __html: sigHtml(mailbox.signature) }} />
          </Box>
        )}
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5, gap: 0.5 }}>
        <Tooltip title="Attach a file"><IconButton aria-label="Attach a file" onClick={() => fileRef.current?.click()}><AttachFileIcon /></IconButton></Tooltip>
        <Typography sx={{ fontSize: 11.5, color: tokens.ink3, ml: 0.5 }}>{saved ? "Draft saved" : ""}</Typography>
        <Box sx={{ flex: 1 }} />
        <Button onClick={bin} color="inherit">Throw away</Button>
        <Tooltip title={canSend ? "" : "Add who it's going to first"}>
          <span>
            <Button variant="contained" disableElevation disabled={!canSend} onClick={submit}>Send</Button>
          </span>
        </Tooltip>
      </DialogActions>
      <Dialog open={confirmBin} onClose={() => setConfirmBin(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 600 }}>Throw this email away?</DialogTitle>
        <DialogContent><Typography sx={{ fontSize: 13.5, color: tokens.ink2 }}>What you've written will be gone. Nothing is sent.</Typography></DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirmBin(false)}>Keep writing</Button>
          <Button color="error" variant="contained" disableElevation onClick={() => { clearDraft(); onClose(); }}>Throw away</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

// ── Signature editor ────────────────────────────────────────────────────────
function SignatureDialog({ mailbox, onClose, onSaved }: { mailbox: Mailbox; onClose: () => void; onSaved: () => void }) {
  const [sig, setSig] = useState(() => (isHtml(mailbox.signature) ? mailbox.signature : esc(mailbox.signature).replace(/\n/g, "<br>")));
  const snack = useSnack();
  const save = useMutation({
    mutationFn: () => saveSignature(mailbox.email, sig),
    onSuccess: () => { snack("Signature saved."); onSaved(); },
    onError: () => snack("Couldn't save the signature. Try again."),
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 1.5 } }}>
      <DialogTitle sx={{ fontSize: 16, fontWeight: 600 }}>Signature · {mailbox.email}</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: 12.5, color: tokens.ink3, mb: 1 }}>
          Goes on the bottom of every email sent from this mailbox. You can make text bold, add a link, or drop in a logo.
        </Typography>
        <MailEditor initial={sig} placeholder="Your name, EstateKit, your number" onChange={setSig} minHeight={140} />
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" disableElevation disabled={save.isPending} onClick={() => save.mutate()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── The page ────────────────────────────────────────────────────────────────
export default function MailPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const snack = useSnack();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  const [params, setParams] = useSearchParams();
  const [mailbox, setMailbox] = useState<string>(() => params.get("box") || localStorage.getItem(LAST_MB) || "");
  const [folder, setFolder] = useState<MailTab>(() => (params.get("folder") as MailTab) || "inbox");
  const [selected, setSelected] = useState<string | null>(() => params.get("thread"));
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState<Draft | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [hideNews, setHideNews] = useState<boolean>(() => localStorage.getItem(HIDE_NEWS) !== "0");
  const sendTimer = useRef<number | null>(null);
  const people = useDirectory();

  const mailboxes = useQuery({ queryKey: ["mailboxes"], queryFn: listMailboxes, staleTime: 5 * 60_000 });
  const mbList = mailboxes.data ?? [];
  const currentMb = useMemo(() => mbList.find((m) => m.email === mailbox) ?? mbList[0], [mbList, mailbox]);

  useEffect(() => { if (!mailbox && mbList.length) setMailbox(mbList[0].email); }, [mbList, mailbox]);
  useEffect(() => { if (currentMb) localStorage.setItem(LAST_MB, currentMb.email); }, [currentMb]);
  useEffect(() => { localStorage.setItem(HIDE_NEWS, hideNews ? "1" : "0"); }, [hideNews]);

  // Deep links: ?box=…&folder=…&thread=…, plus ?to=…&subject=…&body=… to open
  // a part-written email, and ?draft=1 to pick the saved one back up.
  const wantDraft = params.get("draft");
  const wantTo = params.get("to");
  useEffect(() => {
    const next = new URLSearchParams(params);
    let changed = false;
    if (wantDraft) {
      const stored = getDraft();
      if (stored) {
        setCompose({ ...stored, rich: true });
        if (stored.mailbox) setMailbox(stored.mailbox);
      } else {
        snack("That draft is gone — nothing was saved.");
      }
      next.delete("draft");
      changed = true;
    } else if (wantTo !== null) {
      setCompose({ to: wantTo, cc: params.get("cc") ?? "", subject: params.get("subject") ?? "", body: params.get("body") ?? "" });
      ["to", "cc", "subject", "body"].forEach((k) => next.delete(k));
      changed = true;
    }
    if (changed) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantDraft, wantTo]);

  // Keep the URL in step with what's on screen, so any view can be shared.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (currentMb) next.set("box", currentMb.email); else next.delete("box");
    next.set("folder", folder);
    if (selected) next.set("thread", selected); else next.delete("thread");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMb, selected, folder]);

  const gmailFolder: Folder = folder === "auto" ? "inbox" : folder;
  const threads = useQuery({
    queryKey: ["mailThreads", currentMb?.email, gmailFolder, search, hideNews],
    queryFn: () => listThreads(currentMb!.email, gmailFolder, search || undefined, undefined, hideNews),
    enabled: !!currentMb && folder !== "auto",
    staleTime: 30_000,
  });
  const thread = useQuery({
    queryKey: ["mailThread", currentMb?.email, selected],
    queryFn: () => getThread(currentMb!.email, selected!),
    enabled: !!currentMb && !!selected,
  });

  const notConnected = threads.error instanceof MailNotConnected;

  const act = useMutation({
    mutationFn: ({ id, change }: { id: string; change: { archive?: boolean; unarchive?: boolean; read?: boolean } }) =>
      modifyThread(currentMb!.email, id, change),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["mailThreads"] });
      qc.invalidateQueries({ queryKey: ["mailUnread"] });
      setSelected(null);
      snack(v.change.unarchive ? "Back in the inbox." : v.change.archive ? "Archived. Find it under Archive or All mail." : "Done.");
    },
    onError: () => snack("That didn't go through. Try again."),
  });

  const openThread = (id: string) => {
    setSelected(id);
    qc.invalidateQueries({ queryKey: ["mailThreads"] });
    qc.invalidateQueries({ queryKey: ["mailUnread"] });
  };

  // Send with a Gmail-style undo window: hold the send for a few seconds and
  // let the user take it back before it actually leaves.
  const reallySend = (d: Draft) => {
    if (!currentMb) return;
    sendMail(currentMb.email, {
      to: d.to, cc: d.cc || undefined, subject: d.subject || "(no subject)",
      html: d.body, threadId: d.threadId, inReplyTo: d.inReplyTo, references: d.references,
      attachments: d.attachments, inline: d.inline,
    })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["mailThreads"] });
        if (d.threadId) qc.invalidateQueries({ queryKey: ["mailThread", currentMb.email, d.threadId] });
        snack("Sent.");
      })
      .catch(() => { snack("That email didn't go out. Your draft is back — try Send again."); setCompose(d); });
  };
  const handleSend = (d: Draft) => {
    setCompose(null);
    clearDraft();
    if (sendTimer.current) window.clearTimeout(sendTimer.current);
    sendTimer.current = window.setTimeout(() => { sendTimer.current = null; reallySend(d); }, UNDO_MS);
    snack("Sending…", () => {
      if (sendTimer.current) { window.clearTimeout(sendTimer.current); sendTimer.current = null; }
      setCompose(d); // brought back, nothing sent
    }, "Undo");
  };

  const quoteOf = (m: MessageFull) =>
    `<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex;color:#555">On ${esc(timeFull(m.date))}, ${esc(m.from.name || m.from.email)} wrote:<br>${m.html}</blockquote>`;

  const startReply = (m: MessageFull, all = false) => {
    if (!currentMb) return;
    const others = [m.from.email, ...(all ? `${m.to},${m.cc}`.split(",") : [])]
      .map((s) => emailIn(s))
      .filter((e) => e && e.toLowerCase() !== currentMb.email.toLowerCase());
    setCompose({
      to: Array.from(new Set(others)).join(", "),
      cc: "",
      subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
      body: "",
      threadId: selected ?? undefined,
      inReplyTo: m.messageId,
      references: m.messageId,
      quoted: quoteOf(m),
      replyTo: { name: m.from.name, email: m.from.email, subject: m.subject },
    });
  };
  const startForward = (m: MessageFull) => {
    setCompose({
      to: "", cc: "",
      subject: /^fwd:/i.test(m.subject) ? m.subject : `Fwd: ${m.subject}`,
      body: "",
      quoted: `<br>---------- Forwarded message ----------<br>From: ${esc(m.from.name)} &lt;${esc(m.from.email)}&gt;<br>Date: ${esc(timeFull(m.date))}<br>Subject: ${esc(m.subject)}<br><br>${m.html}`,
    });
  };

  const showList = !selected;
  const archived = folder === "archive";
  const msgs = thread.data?.messages ?? [];
  const last = msgs[msgs.length - 1];

  return (
    <Box sx={{ height: "100dvh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important", gap: 1 }}>
          <IconButton edge="start" color="inherit" onClick={() => (selected ? setSelected(null) : navigate(-1))} aria-label="Back"><ArrowBackIcon /></IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500, mr: 1, display: { xs: "none", sm: "block" } }}>Mail</Typography>
          {currentMb && (
            <Select
              size="small" value={currentMb.email}
              onChange={(e) => { setMailbox(e.target.value); setSelected(null); }}
              sx={{
                fontSize: 14, maxWidth: { xs: 190, sm: 320 }, bgcolor: "rgba(255,255,255,0.12)", color: "inherit",
                ".MuiSvgIcon-root": { color: "inherit" }, ".MuiOutlinedInput-notchedOutline": { border: 0 },
              }}
            >
              {mbList.map((m) => <MenuItem key={m.email} value={m.email} sx={{ fontSize: 14 }}>{m.display_name} · {m.email}</MenuItem>)}
            </Select>
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Check for new mail">
            <IconButton color="inherit" aria-label="Check for new mail" onClick={() => { threads.refetch(); qc.invalidateQueries({ queryKey: ["mailUnread"] }); }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit signature">
            <IconButton color="inherit" aria-label="Edit signature" onClick={() => setSigOpen(true)}><SignatureIcon /></IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* Folders + search */}
      <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, display: "flex", alignItems: "center", gap: 1, px: { xs: 0.5, sm: 1.5 } }}>
        <Tabs
          value={folder}
          onChange={(_e, v) => { setFolder(v as MailTab); setSelected(null); }}
          variant="scrollable" scrollButtons={false}
          sx={{ minHeight: 44, "& .MuiTab-root": { minHeight: 44, minWidth: 0, px: 1.5, fontSize: 13.5, textTransform: "none" } }}
        >
          <Tab value="inbox" label="Inbox" />
          <Tab value="sent" label="Sent" />
          <Tab value="archive" label="Archive" />
          <Tab value="all" label="All mail" />
          <Tab value="auto" label="Automated" icon={<SmartToyOutlinedIcon sx={{ fontSize: 17 }} />} iconPosition="start" />
        </Tabs>
        <Box sx={{ flex: 1 }} />
        {folder !== "auto" && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, bgcolor: tokens.hover, borderRadius: 1, px: 1, my: 0.75 }}>
            <SearchIcon sx={{ fontSize: 18, color: tokens.ink3 }} />
            <InputBase
              placeholder="Search mail" value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setSearch(q); setSelected(null); } }}
              sx={{ fontSize: 13.5, width: { xs: 96, sm: 180 } }}
              inputProps={{ "aria-label": "Search mail" }}
            />
            {search && <IconButton size="small" onClick={() => { setQ(""); setSearch(""); }} aria-label="Clear search"><CloseIcon sx={{ fontSize: 15 }} /></IconButton>}
          </Box>
        )}
      </Box>

      {folder === "inbox" && !search && (
        <Box sx={{ px: { xs: 1.5, md: 2 }, py: 0.75, bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
          <Chip
            size="small"
            onClick={() => setHideNews((v) => !v)}
            label={hideNews ? "Newsletters and social mail hidden — show them" : "Showing everything — hide newsletters"}
            sx={{ fontSize: 11.5, height: 26, bgcolor: hideNews ? tokens.hover : tokens.amberTint, cursor: "pointer" }}
          />
        </Box>
      )}

      {folder === "auto" ? (
        <Box sx={{ flex: 1, overflowY: "auto" }}><AutomatedMail /></Box>
      ) : (
        <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* Thread list */}
          <Box
            sx={{
              width: { xs: "100%", md: 340, lg: 400 }, flexShrink: 0,
              display: { xs: showList ? "block" : "none", md: "block" },
              borderRight: { md: `1px solid ${tokens.divider}` }, overflowY: "auto", bgcolor: "background.paper",
            }}
          >
            {notConnected && (
              <Box sx={{ p: 3 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.5 }}>Inbox not connected yet</Typography>
                <Typography sx={{ fontSize: 13, color: tokens.ink3, lineHeight: 1.5 }}>
                  Once the Google key is in place this becomes your live {currentMb?.email} inbox — read, reply and send.
                </Typography>
              </Box>
            )}
            {threads.isLoading && <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}><CircularProgress size={22} /></Box>}
            {threads.isError && !notConnected && (
              <Box sx={{ p: 3 }}><Typography sx={{ fontSize: 13, color: tokens.red }}>Couldn't load this folder. Tap the refresh arrow to try again.</Typography></Box>
            )}
            {threads.data?.threads.length === 0 && (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography sx={{ fontSize: 14, color: tokens.ink3 }}>
                  {search ? `Nothing matches "${search}".` : folder === "inbox" ? "Inbox empty. Nicely done." : "Nothing here."}
                </Typography>
                {!search && folder === "inbox" && hideNews && (
                  <Button size="small" sx={{ mt: 1, textTransform: "none" }} onClick={() => setHideNews(false)}>Show newsletters too</Button>
                )}
              </Box>
            )}
            {threads.data?.threads.map((t) => (
              <ThreadRow key={t.id} t={t} active={t.id === selected} onClick={() => openThread(t.id)} />
            ))}
          </Box>

          {/* Reading pane */}
          <Box sx={{ flex: 1, minWidth: 0, display: { xs: showList ? "none" : "block", md: "block" }, overflowY: "auto" }}>
            {!selected && (
              <Box sx={{ display: { xs: "none", md: "flex" }, height: "100%", alignItems: "center", justifyContent: "center" }}>
                <Typography sx={{ color: tokens.ink3, fontSize: 14 }}>Pick an email on the left to read it</Typography>
              </Box>
            )}
            {selected && thread.isLoading && <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress size={24} /></Box>}
            {selected && thread.isError && (
              <Box sx={{ p: 3 }}><Typography sx={{ fontSize: 13, color: tokens.red }}>Couldn't open this email. Go back and try again.</Typography></Box>
            )}
            {selected && thread.data && currentMb && (
              <Box sx={{ maxWidth: 860, mx: "auto", p: { xs: 1.25, md: 3 }, pb: { xs: 12, md: 10 } }}>
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1.5 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: { xs: 17, md: 20 }, fontWeight: 500, lineHeight: 1.3 }}>{thread.data.subject}</Typography>
                    {msgs.length > 1 && (
                      <Typography sx={{ fontSize: 12, color: tokens.ink3, mt: 0.25 }}>{msgs.length} emails in this conversation</Typography>
                    )}
                  </Box>
                  <Tooltip title={archived ? "Put it back in the inbox" : "Archive — takes it out of the inbox, keeps it in All mail"}>
                    <IconButton
                      aria-label={archived ? "Put it back in the inbox" : "Archive"}
                      onClick={() => act.mutate({ id: selected, change: archived ? { unarchive: true } : { archive: true } })}
                      sx={{ width: 44, height: 44 }}
                    >
                      {archived ? <MoveToInboxOutlinedIcon fontSize="small" /> : <ArchiveOutlinedIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </Box>
                {msgs.map((m, i) => (
                  <MessageBlock
                    key={m.id}
                    m={m}
                    mailbox={currentMb.email}
                    startOpen={i === msgs.length - 1}
                    canReplyAll={`${m.to},${m.cc}`.split(",").some((s) => emailIn(s) && emailIn(s).toLowerCase() !== currentMb.email.toLowerCase())}
                    onReply={() => startReply(m)}
                    onReplyAll={() => startReply(m, true)}
                    onForward={() => startForward(m)}
                  />
                ))}
                {last && (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2 }}>
                    <Button variant="contained" disableElevation startIcon={<ReplyIcon />} onClick={() => startReply(last)}>
                      Reply to {last.from.name?.split(" ")[0] || last.from.email}
                    </Button>
                    <Button variant="outlined" color="inherit" startIcon={<ForwardIcon />} onClick={() => startForward(last)}>Forward</Button>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Write a new email. Sits clear of the phone's bottom bar. */}
      {folder !== "auto" && (
        <Button
          variant="contained" disableElevation startIcon={<EditOutlinedIcon />}
          onClick={() => currentMb && setCompose({ to: "", cc: "", subject: "", body: "" })}
          disabled={!currentMb}
          sx={{ position: "fixed", right: { xs: 14, md: 24 }, bottom: { xs: 18, md: 24 }, borderRadius: 7, px: 2.5, py: 1.25, boxShadow: 3, zIndex: 1200 }}
        >
          {desktop ? "Write an email" : "Write"}
        </Button>
      )}

      {!compose && <MailDraftPill />}
      {compose && currentMb && <Compose mailbox={currentMb} draft={compose} people={people} onClose={() => setCompose(null)} onSend={handleSend} />}
      {sigOpen && currentMb && (
        <SignatureDialog mailbox={currentMb} onClose={() => setSigOpen(false)} onSaved={() => { setSigOpen(false); qc.invalidateQueries({ queryKey: ["mailboxes"] }); }} />
      )}
    </Box>
  );
}

function ThreadRow({ t, active, onClick }: { t: ThreadSummary; active: boolean; onClick: () => void }) {
  return (
    <Box
      onClick={onClick}
      role="button"
      sx={{
        display: "flex", gap: 1.25, px: 2, py: 1.25, cursor: "pointer", minHeight: 64,
        borderBottom: `1px solid ${tokens.divider}`,
        bgcolor: active ? tokens.hover : "transparent",
        "&:hover": { bgcolor: tokens.hover },
      }}
    >
      <SenderAvatar name={t.who.name} email={t.who.email} size={36} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <Typography noWrap sx={{ fontSize: 14, fontWeight: t.unread ? 700 : 500, color: tokens.ink, flex: 1 }}>
            {t.who.name}{t.count > 1 ? ` (${t.count})` : ""}
          </Typography>
          <Tooltip title={timeFull(t.date)}>
            <Typography sx={{ fontSize: 11.5, color: t.unread ? tokens.primary : tokens.ink3, whiteSpace: "nowrap", fontWeight: t.unread ? 700 : 400 }}>
              {timeShort(t.date)}
            </Typography>
          </Tooltip>
        </Box>
        <Typography noWrap sx={{ fontSize: 13.5, fontWeight: t.unread ? 600 : 400, color: tokens.ink }}>{t.subject}</Typography>
        <Typography noWrap sx={{ fontSize: 12.5, color: tokens.ink3 }}>{t.snippet}</Typography>
      </Box>
      {t.unread && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: tokens.primary, mt: 1, flexShrink: 0 }} />}
    </Box>
  );
}

/** One email in the conversation. Older ones come in folded up (same as Gmail)
 *  so a long back-and-forth isn't a wall of text; the newest one is open. */
function MessageBlock({ m, mailbox, startOpen, canReplyAll, onReply, onReplyAll, onForward }: {
  m: MessageFull; mailbox: string; startOpen: boolean; canReplyAll: boolean;
  onReply: () => void; onReplyAll: () => void; onForward: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const preview = useMemo(() => plainText(m.html).slice(0, 120), [m.html]);
  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: 1.5, mb: 1.5, bgcolor: "background.paper", overflow: "hidden" }}>
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 1.25, px: { xs: 1.25, md: 2 }, py: 1.25, cursor: "pointer", "&:hover": { bgcolor: tokens.hover } }}
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
      >
        <SenderAvatar name={m.from.name} email={m.from.email} size={34} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600 }}>
            {m.from.name || m.from.email}
            <Typography component="span" sx={{ fontSize: 12, color: tokens.ink3, ml: 0.5 }}>&lt;{m.from.email}&gt;</Typography>
          </Typography>
          <Typography noWrap sx={{ fontSize: 12, color: tokens.ink3 }}>{open ? `to ${m.to}` : preview}</Typography>
        </Box>
        <Tooltip title={timeFull(m.date)}>
          <Typography sx={{ fontSize: 12, color: tokens.ink3, whiteSpace: "nowrap" }}>{timeShort(m.date)}</Typography>
        </Tooltip>
        <ExpandMoreIcon sx={{ fontSize: 20, color: tokens.ink3, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </Box>
      {open && (
        <>
          <Divider />
          <Box sx={{ bgcolor: "#fff" }}>
            <Body html={m.html} />
          </Box>
          {m.attachments.length > 0 && (
            <Box sx={{ px: { xs: 1.25, md: 2 }, pt: 1.5, display: "flex", flexWrap: "wrap", gap: 1 }}>
              {m.attachments.map((a) => <AttachmentChip key={a.attachmentId} mailbox={mailbox} messageId={m.id} att={a} />)}
            </Box>
          )}
          <Box sx={{ display: "flex", gap: 0.5, px: { xs: 0.75, md: 1.5 }, py: 0.75 }}>
            <Tooltip title={`Reply to ${m.from.name || m.from.email}`}>
              <IconButton size="small" aria-label="Reply" onClick={onReply} sx={{ width: 40, height: 40 }}><ReplyIcon fontSize="small" /></IconButton>
            </Tooltip>
            {canReplyAll && (
              <Tooltip title="Reply to everyone on this email">
                <IconButton size="small" aria-label="Reply to everyone" onClick={onReplyAll} sx={{ width: 40, height: 40 }}><ReplyAllIcon fontSize="small" /></IconButton>
              </Tooltip>
            )}
            <Tooltip title="Forward this to someone else">
              <IconButton size="small" aria-label="Forward" onClick={onForward} sx={{ width: 40, height: 40 }}><ForwardIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Box>
        </>
      )}
    </Box>
  );
}

// ── Automated mail: what EstateKit sent on its own ──────────────────────────
function AutoRow({ e }: { e: SentEmail }) {
  return (
    <Box sx={{ display: "flex", gap: 1.25, alignItems: "center", px: { xs: 1.5, md: 2 }, py: 1.25, borderBottom: `1px solid ${tokens.divider}`, minHeight: 60 }}>
      <SenderAvatar name={e.lead_name || e.lead_email || "?"} email={e.lead_email ?? ""} size={34} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 500 }}>{e.lead_name || e.lead_email || "Unknown lead"}</Typography>
        <Typography noWrap sx={{ fontSize: 12.5, color: tokens.ink2 }}>{e.subject || "(no subject)"}</Typography>
      </Box>
      <Box sx={{ textAlign: "right", flexShrink: 0 }}>
        <Ticks delivered={e.delivered} opened={!!e.opened_at} clicked={e.clicked} bounced={e.bounced} />
        <Tooltip title={timeFull(e.sent_at)}>
          <Typography sx={{ fontSize: 11, color: tokens.ink3 }}>{timeShort(e.sent_at)}</Typography>
        </Tooltip>
      </Box>
    </Box>
  );
}

function AutomatedMail() {
  const emails = useQuery({ queryKey: ["workflowEmails", 30], queryFn: () => listWorkflowEmails(30), staleTime: 60_000, retry: false });
  const metrics = useQuery({ queryKey: ["emailMetrics", 30], queryFn: () => emailMetrics(30), staleTime: 60_000, retry: false });
  const notSetUp = emails.error instanceof WorkflowEmailsNotSetUp;

  if (emails.isLoading) return <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress size={22} /></Box>;
  if (notSetUp) return <Box sx={{ p: 3 }}><Typography sx={{ fontSize: 13.5, color: tokens.ink3 }}>No automated emails have been set up yet.</Typography></Box>;
  if (emails.isError) return <Box sx={{ p: 3 }}><Typography sx={{ fontSize: 13, color: tokens.red }}>Couldn't load the automated emails. Try again in a moment.</Typography></Box>;

  const rows = emails.data ?? [];
  const m = metrics.data;
  return (
    <Box>
      <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.5, bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.25 }}>Emails EstateKit sent on its own</Typography>
        <Typography sx={{ fontSize: 12.5, color: tokens.ink3 }}>
          The nurture and follow-up emails from the workflows — last 30 days. Nobody has to send these by hand.
        </Typography>
        {m && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2.5, mt: 1.25 }}>
            {[
              { n: m.sent, l: "sent" },
              { n: m.opened, l: `opened (${Math.round(m.openRate * 100)}%)` },
              { n: m.clicked, l: "tapped a link" },
              { n: m.bounced + m.complained, l: "didn't arrive" },
            ].map((s) => (
              <Box key={s.l}>
                <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{s.n}</Typography>
                <Typography sx={{ fontSize: 11.5, color: tokens.ink3 }}>{s.l}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
      {rows.length === 0 && (
        <Box sx={{ p: 4, textAlign: "center" }}><Typography sx={{ fontSize: 14, color: tokens.ink3 }}>Nothing sent in the last 30 days.</Typography></Box>
      )}
      {rows.map((e) => <AutoRow key={e.id} e={e} />)}
      {rows.length > 0 && (
        <Typography sx={{ fontSize: 11.5, color: tokens.ink3, px: 2, py: 2, lineHeight: 1.6 }}>
          The ticks work like WhatsApp: one tick means it left our side, two means it reached their inbox, and they
          change colour once the person opens it. "Tapped a link" only counts links that run through our own tracking
          link, so it's the confirmation email today — not the nurture ones.
        </Typography>
      )}
    </Box>
  );
}
