import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Autocomplete, Box, Button, Chip, createFilterOptions, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";
import RemoveIcon from "@mui/icons-material/Remove";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatClearIcon from "@mui/icons-material/FormatClear";
import InsertLinkIcon from "@mui/icons-material/InsertLink";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import { tokens } from "../theme";
import { useSnack } from "../hooks/useSnack";
import { listMailContacts } from "../api/clients";
import { listMailboxes, sendMail, type Inline, type Mailbox, type Upload } from "../api/mail";
import { clearDraft, draftLabel, getDraft, isEmptyDraft, saveDraft, subscribeDraft } from "../lib/mailDraft";
import {
  closeCompose, getCompose, minimizeCompose, openCompose, subscribeCompose, updateCompose, type Draft,
} from "../lib/composeWindow";

export { openCompose, type Draft };

export const LAST_MB = "ek.mail.mailbox";
const UNDO_MS = 4000; // window to cancel a send before it actually goes
const MAX_ATTACH = 22 * 1024 * 1024; // keep total raw size under Gmail's limit

// ── Small shared helpers (the Mail page uses these too) ─────────────────────
export const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
export const isHtml = (s: string) => /<[a-z][\s\S]*>/i.test(s);
export const sigHtml = (sig: string) => {
  const t = sig.trim();
  if (!t) return "";
  // A signature saved with the rich editor is already html; an older plain-text
  // one keeps its line breaks.
  return `<br><br><div>${isHtml(t) ? t : esc(t).replace(/\n/g, "<br>")}</div>`;
};
export const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
export const plainText = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
export const looksLikeEmail = (s: string) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s);

export function b64ToBytes(d: string): Uint8Array {
  const bin = atob(d.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, ""));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export function attIcon(mime: string) {
  if (/pdf/i.test(mime)) return <PictureAsPdfOutlinedIcon sx={{ fontSize: 18, color: "#b3261e" }} />;
  if (/^image\//i.test(mime)) return <ImageOutlinedIcon sx={{ fontSize: 18, color: tokens.ink2 }} />;
  return <InsertDriveFileOutlinedIcon sx={{ fontSize: 18, color: tokens.ink2 }} />;
}

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

export function Body({ html }: { html: string }) {
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

// ── Rich editor: same feel as the notes box on Overview ─────────────────────
function ToolBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip title={title}>
      <IconButton size="small" aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick} sx={{ width: 34, height: 34, color: tokens.ink2 }}>
        {children}
      </IconButton>
    </Tooltip>
  );
}

export function MailEditor({ initial, placeholder, onChange, minHeight = 190, autoFocus }: {
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
  const { data } = useQuery({ queryKey: ["mailContacts"], queryFn: listMailContacts, staleTime: 5 * 60_000 });
  return data ?? [];
}

/** Matches on the name or the address, a word at a time, so "franko v" and
 *  "vanzyl@" both find Franko van Zyl. */
const matchPeople = createFilterOptions<string>({ trim: true });

const addrOf = (p: Person) => `${p.name.replace(/[",<>]/g, " ").replace(/\s+/g, " ").trim()} <${p.email}>`;
export const emailIn = (token: string) => (token.match(/<([^>]+)>/)?.[1] ?? token).trim();

function RecipientField({ label, value, onChange, onTyping, people, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void;
  /** What's half-typed in the box but not yet turned into a chip. Send counts
   *  it too, so a whole address typed and left sitting there still goes. */
  onTyping?: (v: string) => void;
  people: Person[]; autoFocus?: boolean;
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
      openOnFocus
      options={options}
      filterOptions={matchPeople}
      noOptionsText={people.length ? "Nobody by that name." : "No addresses saved yet — type the whole address."}
      value={chips}
      onChange={(_e, v) => { onTyping?.(""); onChange((v as string[]).join(", ")); }}
      onInputChange={(_e, v, reason) => onTyping?.(reason === "reset" ? "" : v)}
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
      renderValue={(vals, getItemProps) =>
        vals.map((v, i) => {
          const { key, ...rest } = getItemProps({ index: i });
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
          slotProps={{
            ...params.slotProps,
            htmlInput: { ...params.slotProps.htmlInput, inputMode: "email", autoCapitalize: "none", spellCheck: false },
          }}
        />
      )}
    />
  );
}

// ── The compose window ──────────────────────────────────────────────────────
/** Glue everything typed into the "To" box together: the chips already made,
 *  plus anything still sitting in the box unfinished. */
function allRecipients(to: string, typed: string): string {
  return [to.trim(), typed.trim()].filter(Boolean).join(", ");
}

function ComposeWindow({ mailbox, draft, onClose, onSend }: {
  mailbox: Mailbox; draft: Draft; onClose: () => void; onSend: (d: Draft) => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const [d, setD] = useState(draft);
  const [typedTo, setTypedTo] = useState("");
  const [typedCc, setTypedCc] = useState("");
  const [showCc, setShowCc] = useState(!!draft.cc);
  const [showQuoted, setShowQuoted] = useState(false);
  const [atts, setAtts] = useState<(Upload & { size: number })[]>(() => (draft.attachments ?? []).map((a) => ({ ...a, size: b64ToBytes(a.data).length })));
  const [attErr, setAttErr] = useState("");
  const [confirmBin, setConfirmBin] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const people = useDirectory();
  const snack = useSnack();

  const totalSize = atts.reduce((n, a) => n + a.size, 0);
  const toAll = allRecipients(d.to, typedTo);
  const recipients = toAll.split(",").map((s) => emailIn(s)).filter(Boolean);
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
      updateCompose({ ...d, attachments: atts.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })) });
      setSaved(!isEmptyDraft(d));
    }, 500);
    return () => window.clearTimeout(t);
  }, [d, atts, mailbox.email]);

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
      ...d,
      to: toAll,
      cc: allRecipients(d.cc, typedCc),
      body: html, rich: true,
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
    <Dialog open onClose={minimizeCompose} fullWidth maxWidth="sm" fullScreen={phone} slotProps={{ paper: { sx: { borderRadius: phone ? 0 : 1.5 } } }}>
      <DialogTitle sx={{ fontSize: 16, fontWeight: 600, py: 1.5, display: "flex", alignItems: "center", gap: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</Box>
        <Tooltip title="Put it out of the way — you can carry on with it later">
          <IconButton size="small" onClick={minimizeCompose} aria-label="Make this small"><RemoveIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title="Close">
          <IconButton size="small" onClick={bin} aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
        </Tooltip>
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
            <RecipientField label="To" value={d.to} onChange={(v) => setD({ ...d, to: v })} onTyping={setTypedTo} people={people} autoFocus={!d.to} />
          </Box>
          {!showCc && <Button size="small" sx={{ mt: 0.5 }} onClick={() => setShowCc(true)}>Cc</Button>}
        </Box>
        {showCc && <RecipientField label="Cc" value={d.cc} onChange={(v) => setD({ ...d, cc: v })} onTyping={setTypedCc} people={people} />}
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: tokens.ink3 }}>
          <DoneAllIcon sx={{ fontSize: 15 }} />
          <Typography sx={{ fontSize: 11.5 }}>
            Once it's gone, the Sent list shows you whether it arrived, whether they opened it, and whether they tapped a link.
          </Typography>
        </Box>
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

// ── The small bar in the corner ─────────────────────────────────────────────
/** What a shrunk email looks like: a little bar bottom-right, on every page,
 *  exactly like Gmail's. Tap it to carry on writing right where you are. */
function MinimizedBar({ label, onOpen, onBin }: { label: string; onOpen: () => void; onBin: () => void }) {
  return (
    <Box
      sx={{
        position: "fixed", right: { xs: 12, md: 20 }, bottom: { xs: 76, md: 20 }, zIndex: 1250,
        display: "flex", alignItems: "center", gap: 0.5, width: { xs: "calc(100vw - 24px)", sm: 320 },
        bgcolor: tokens.raised, border: `1px solid ${tokens.divider}`, borderBottom: "none",
        borderRadius: "10px 10px 0 0", boxShadow: 6, pl: 1.5, pr: 0.5, py: 0.75,
      }}
    >
      <Box onClick={onOpen} role="button" sx={{ minWidth: 0, flex: 1, cursor: "pointer" }}>
        <Typography sx={{ fontSize: 10.5, color: tokens.ink3, lineHeight: 1.2 }}>Unfinished email</Typography>
        <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, color: tokens.ink, lineHeight: 1.3 }}>{label}</Typography>
      </Box>
      <Tooltip title="Carry on writing it">
        <IconButton size="small" aria-label="Carry on writing it" onClick={onOpen} sx={{ width: 36, height: 36 }}>
          <OpenInFullIcon sx={{ fontSize: 17 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Throw this draft away">
        <IconButton size="small" aria-label="Throw this draft away" onClick={onBin} sx={{ width: 36, height: 36 }}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

// ── The host: one per app, mounted in the shell ─────────────────────────────
/** Keeps the email you're writing alive across the whole dashboard — open on
 *  Mail, shrink it, walk over to Clients, carry on, send from there. */
export function MailComposeHost() {
  const qc = useQueryClient();
  const snack = useSnack();
  const state = useSyncExternalStore(subscribeCompose, getCompose);
  const sendTimer = useRef<number | null>(null);

  // A draft left behind by a browser refresh shows as the same small bar.
  const [stored, setStored] = useState(() => getDraft());
  useEffect(() => subscribeDraft(() => setStored(getDraft())), []);

  const mailboxes = useQuery({ queryKey: ["mailboxes"], queryFn: listMailboxes, staleTime: 5 * 60_000, retry: false });
  const mbList = useMemo(() => mailboxes.data ?? [], [mailboxes.data]);
  const wanted = state.mailbox || stored?.mailbox || (() => { try { return localStorage.getItem(LAST_MB) ?? ""; } catch { return ""; } })();
  const mb = mbList.find((m) => m.email === wanted) ?? mbList[0];

  useEffect(() => () => { if (sendTimer.current) window.clearTimeout(sendTimer.current); }, []);

  // Send with a Gmail-style undo window: hold the send for a few seconds and
  // let the user take it back before it actually leaves.
  const reallySend = (d: Draft, from: Mailbox) => {
    sendMail(from.email, {
      to: d.to, cc: d.cc || undefined, subject: d.subject || "(no subject)",
      html: d.body, threadId: d.threadId, inReplyTo: d.inReplyTo, references: d.references,
      attachments: d.attachments, inline: d.inline,
    })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["mailThreads"] });
        qc.invalidateQueries({ queryKey: ["mailTicks"] });
        if (d.threadId) qc.invalidateQueries({ queryKey: ["mailThread", from.email, d.threadId] });
        snack("Sent.");
      })
      .catch(() => {
        snack("That email didn't go out. Your draft is back — try Send again.");
        openCompose(d, from.email);
      });
  };

  const handleSend = (d: Draft, from: Mailbox) => {
    closeCompose();
    clearDraft();
    if (sendTimer.current) window.clearTimeout(sendTimer.current);
    sendTimer.current = window.setTimeout(() => { sendTimer.current = null; reallySend(d, from); }, UNDO_MS);
    snack("Sending…", () => {
      if (sendTimer.current) { window.clearTimeout(sendTimer.current); sendTimer.current = null; }
      openCompose(d, from.email); // brought back, nothing sent
    }, "Undo");
  };

  const open = state.draft && !state.minimized;
  if (open && mb) {
    return <ComposeWindow mailbox={mb} draft={state.draft!} onClose={closeCompose} onSend={(d) => handleSend(d, mb)} />;
  }

  // Shrunk, or left over from last time: the little bar.
  const label = state.draft
    ? draftLabel({ ...state.draft, mailbox: wanted, savedAt: 0 })
    : stored ? draftLabel(stored) : "";
  if (!label) return null;
  return (
    <MinimizedBar
      label={label}
      onOpen={() => (state.draft ? openCompose(state.draft, wanted) : stored && openCompose({ ...stored, rich: true }, stored.mailbox))}
      onBin={() => { clearDraft(); closeCompose(); }}
    />
  );
}
