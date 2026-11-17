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
import { listMailboxes, saveSignature, sendMail, type Inline, type Mailbox, type Upload } from "../api/mail";
import { MAX_IMAGE_BYTES, shrinkImage } from "../lib/image";
import { clearDraft, draftLabel, getDraft, isEmptyDraft, saveDraft, subscribeDraft } from "../lib/mailDraft";
import {
  closeCompose, getCompose, minimizeCompose, openCompose, subscribeCompose, updateCompose, type Draft,
} from "../lib/composeWindow";

export { openCompose, type Draft };

export const LAST_MB = "ek.mail.mailbox";
const UNDO_MS = 4000; // window to cancel a send before it actually goes
const MAX_ATTACH = 22 * 1024 * 1024; // keep total raw size under Gmail's limit
/** The EstateKit mark for signatures. A plain address that stays the same from
 *  one release to the next, so the picture still loads in an email somebody
 *  opens months from now. */
export const LOGO_URL = "https://leads.estatekit.co/signature-logo.png";

// ── Small shared helpers (the Mail page uses these too) ─────────────────────
export const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
export const isHtml = (s: string) => /<[a-z][\s\S]*>/i.test(s);
export const sigHtml = (sig: string) => {
  const t = sig.trim();
  if (!t) return "";
  // A signature saved with the rich editor is already html; an older plain-text
  // one keeps its line breaks.
  return `<br><div>${isHtml(t) ? t : esc(t).replace(/\n/g, "<br>")}</div>`;
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

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read failed"));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(blob);
  });
}

/** Reads a file ready to send. A PHOTO is made smaller first: a phone takes
 *  six megabytes of detail no screen will ever show, and the person at the
 *  other end has to download every byte of it. Everything else — a PDF, a
 *  spreadsheet, a signed document — goes exactly as it is. */
async function readFile(file: File): Promise<Upload & { size: number }> {
  let body: Blob = file;
  let filename = file.name;
  if (/^image\//i.test(file.type) && file.size <= MAX_IMAGE_BYTES) {
    const small = await shrinkImage(file, "attach");
    if (small.size < file.size) {
      body = small;
      if (small.type === "image/jpeg" && !/\.jpe?g$/i.test(filename)) {
        filename = `${filename.replace(/\.[^.]+$/, "")}.jpg`;
      }
    }
  }
  const res = await dataUrl(body);
  return {
    filename,
    mimeType: body.type || file.type || "application/octet-stream",
    data: res.slice(res.indexOf(",") + 1),
    size: body.size,
  };
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
  body{margin:0;padding:16px 20px 18px;overflow-x:auto;overflow-y:hidden;-webkit-text-size-adjust:100%;
       font-family:Roboto,Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.6;color:#202124;background:#fff;
       overflow-wrap:anywhere}
  @media (max-width:600px){body{padding:14px 14px 16px;font-size:14px}}
  /* The first and last thing in the mail shouldn't add to our own padding. */
  body>*:first-child{margin-top:0}
  body>*:last-child{margin-bottom:0}
  img{max-width:100%;height:auto}
  a{color:#1a5fb4}
  blockquote{margin:12px 0 12px 2px;border-left:2px solid #dadce0;padding:2px 0 2px 12px;color:#5f6368}
  pre{white-space:pre-wrap;word-break:break-word}
  table{max-width:100%}
  hr{border:0;border-top:1px solid #e8eaed;margin:16px 0}
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

export function MailEditor({ initial, placeholder, onChange, minHeight = 190, autoFocus, logo }: {
  initial: string; placeholder: string; onChange: (html: string) => void; minHeight?: number; autoFocus?: boolean;
  /** Offer a one-tap EstateKit logo. On for signatures, off for ordinary mail. */
  logo?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = useState(!plainText(initial) && !/<img/i.test(initial));
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  // The picture being resized, and where to draw the outline and the dot.
  const [picked, setPicked] = useState<HTMLImageElement | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
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

  /** Put the outline and the dot where the picture currently is. */
  const place = useCallback((img: HTMLImageElement | null) => {
    const wrap = wrapRef.current;
    const ed = ref.current;
    if (!img || !wrap || !ed || !ed.contains(img)) { setBox(null); return; }
    const r = img.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const e = ed.getBoundingClientRect();
    // Scrolled out of sight — no dot floating over the rest of the message.
    if (r.bottom < e.top + 4 || r.top > e.bottom - 4) { setBox(null); return; }
    setBox({ left: r.left - w.left, top: r.top - w.top, width: r.width, height: r.height });
  }, []);

  useEffect(() => {
    const onResize = () => place(picked);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [picked, place]);

  /** Drag the dot: the picture follows your finger, and the size is written
   *  onto it the way email programs understand. */
  const startResize = (e: React.PointerEvent) => {
    const img = picked;
    if (!img) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = img.getBoundingClientRect().width;
    const widest = (ref.current?.clientWidth ?? 600) - 24;
    const move = (ev: PointerEvent) => {
      const w = Math.round(Math.max(40, Math.min(widest, startW + (ev.clientX - startX))));
      img.style.width = `${w}px`;
      img.style.height = "auto";
      img.style.maxWidth = "100%";
      img.setAttribute("width", String(w));
      img.removeAttribute("height");
      place(img);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      emit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

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
        if (f.size > MAX_IMAGE_BYTES) { snack("That picture is too big to read. Attach it as a file instead."); continue; }
        const small = await shrinkImage(f, "inline");
        const use = small.size < f.size ? small : f;
        if (use.size > 4 * 1024 * 1024) { snack("That picture is too big to put in the email. Attach it as a file instead."); continue; }
        insert(`<img src="${await dataUrl(use)}" style="max-width:100%;height:auto" alt="">`);
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
        {logo && (
          <Button
            size="small"
            onClick={() => insert(`<img src="${LOGO_URL}" alt="EstateKit" width="150" style="width:150px;height:auto;max-width:100%">`)}
            sx={{ ml: 0.5, textTransform: "none", fontSize: 12.5 }}
          >
            EstateKit logo
          </Button>
        )}
        {picked && (
          <Typography sx={{ fontSize: 12, color: tokens.ink3, ml: 1 }}>
            Drag the blue dot to make the picture bigger or smaller
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <ToolBtn title="Undo" onClick={() => cmd("undo")}><UndoIcon sx={{ fontSize: 19 }} /></ToolBtn>
        <ToolBtn title="Redo" onClick={() => cmd("redo")}><RedoIcon sx={{ fontSize: 19 }} /></ToolBtn>
      </Box>
      <Box ref={wrapRef} sx={{ position: "relative" }}>
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
          onInput={() => { emit(); place(picked); }}
          onBlur={emit}
          onScroll={() => place(picked)}
          onClick={(e) => {
            const t = e.target as HTMLElement;
            if (t.tagName === "IMG") { setPicked(t as HTMLImageElement); place(t as HTMLImageElement); }
            else { setPicked(null); setBox(null); }
          }}
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
        {box && (
          <>
            <Box sx={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, border: `2px solid ${tokens.primary}`, borderRadius: 0.5, pointerEvents: "none" }} />
            <Box
              role="button"
              aria-label="Resize the picture"
              onPointerDown={startResize}
              sx={{
                position: "absolute", left: box.left + box.width - 10, top: box.top + box.height - 10,
                width: 20, height: 20, borderRadius: "50%", bgcolor: tokens.primary, border: "2px solid #fff",
                boxShadow: "0 1px 4px rgba(0,0,0,.35)", cursor: "nwse-resize", touchAction: "none",
              }}
            />
          </>
        )}
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

/** Tidy up one typed address. Trailing commas and stray spaces go, and a
 *  doubled @ becomes one — no address can hold two, so it's always a slip of
 *  the finger, and it is the difference between the mail going and a red
 *  "that doesn't look like an email address". */
const tidyAddr = (raw: string) => raw.trim().replace(/^[,;\s]+|[,;\s]+$/g, "").replace(/@{2,}/g, "@");

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
  // What's being typed, held here so clicking away can finish it off.
  const [text, setText] = useState("");

  const type = (v: string) => { setText(v); onTyping?.(v); };

  /** Turn whatever is in the box into addresses. Called when they press enter,
   *  type a comma — and, the point of all this, when they simply click away. */
  const commit = (raw: string) => {
    const parts = raw.split(/[,;]+/).map(tidyAddr).filter(Boolean);
    type("");
    if (parts.length) onChange([...chips, ...parts].join(", "));
  };

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
      inputValue={text}
      onChange={(_e, v) => { type(""); onChange((v as string[]).map(tidyAddr).filter(Boolean).join(", ")); }}
      onInputChange={(_e, v, reason) => {
        if (reason === "reset") type("");
        else if (/[,;]/.test(v)) commit(v);
        else type(v);
      }}
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
          onBlur={() => commit(text)}
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

// ── The signature editor ────────────────────────────────────────────────────
/** What goes on the bottom of everything sent from this mailbox. Lives here so
 *  it can be opened straight from the email you're writing, as well as from the
 *  pencil at the top of the Mail page. */
export function SignatureDialog({ mailbox, onClose, onSaved }: { mailbox: Mailbox; onClose: () => void; onSaved: () => void }) {
  const [sig, setSig] = useState(() => (isHtml(mailbox.signature) ? mailbox.signature : esc(mailbox.signature).replace(/\n/g, "<br>")));
  const [state, setState] = useState<"" | "saving" | "saved">("");
  const untouched = useRef(true);
  const snack = useSnack();
  // Held in a ref so saving doesn't restart the timer every time the mailbox
  // list refreshes underneath us.
  const savedCb = useRef(onSaved);
  savedCb.current = onSaved;

  const put = async (html: string) => {
    setState("saving");
    try {
      await saveSignature(mailbox.email, html);
      setState("saved");
      savedCb.current();
      return true;
    } catch {
      setState("");
      snack("Couldn't save the signature. Try again.");
      return false;
    }
  };

  // Saves itself a moment after you stop typing, the way an unfinished email
  // does. There's no Save button to forget, and because it belongs to the
  // mailbox rather than to you, it never turns up as a draft in the corner.
  useEffect(() => {
    if (untouched.current) { untouched.current = false; return; }
    setState("saving");
    const t = window.setTimeout(() => { void put(sig); }, 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, mailbox.email]);

  const done = async () => {
    // Anything typed in the last second hasn't been saved yet.
    if (state === "saving") { if (!(await put(sig))) return; }
    onClose();
  };

  return (
    <Dialog open onClose={done} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { borderRadius: 1.5 } } }}>
      <DialogTitle sx={{ fontSize: 16, fontWeight: 600 }}>Signature · {mailbox.email}</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: 12.5, color: tokens.ink3, mb: 1 }}>
          Goes on the bottom of every email sent from this mailbox. Make text bold, add a link, or drop the EstateKit
          logo in. It saves itself as you go.
        </Typography>
        <MailEditor initial={sig} placeholder="Your name, EstateKit, your number" onChange={setSig} minHeight={140} logo />
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Typography sx={{ flex: 1, fontSize: 12, color: tokens.ink3 }}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : ""}
        </Typography>
        <Button variant="contained" disableElevation onClick={done}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── The compose window ──────────────────────────────────────────────────────
/** Glue everything typed into the "To" box together: the chips already made,
 *  plus anything still sitting in the box unfinished. */
function allRecipients(to: string, typed: string): string {
  return [...to.split(","), ...typed.split(/[,;]/)].map(tidyAddr).filter(Boolean).join(", ");
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
  const [sigOpen, setSigOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const qc = useQueryClient();
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
      } else {
        setAtts(next);
      }
    } catch {
      snack("Couldn't attach that file.");
    }
    // Always cleared, even after a file was turned away, so the same file can
    // be picked again without closing and reopening the email.
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = () => {
    // Blank lines left at the end of what was typed would otherwise push the
    // signature halfway down the email.
    const body = d.body.replace(/(?:\s|&nbsp;|<br\s*\/?>|<div>(?:\s|&nbsp;|<br\s*\/?>)*<\/div>)+$/gi, "");
    // Pictures are pulled out of the WHOLE email, signature and quoted reply
    // included — not just the part that was typed. A picture left sitting in
    // the html as raw data is thrown away by most email programs, which is how
    // a logo ends up as a mystery attachment instead of in the signature.
    const { html, inline } = extractInlineImages(
      `<div>${body}</div>${sigHtml(mailbox.signature)}${d.quoted ? `<br>${d.quoted}` : ""}`,
    );
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
        {/* Always shown, set or not: the only signature that goes on this email
            is the one made here, so an empty one is worth seeing. */}
        <Box sx={{ borderTop: `1px solid ${tokens.divider}`, pt: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography sx={{ fontSize: 11, color: tokens.ink3, flex: 1 }}>
              {mailbox.signature.trim() ? "Your signature goes on the bottom" : "No signature on this mailbox yet"}
            </Typography>
            <Button size="small" onClick={() => setSigOpen(true)} sx={{ textTransform: "none", fontSize: 12 }}>
              {mailbox.signature.trim() ? "Change it" : "Add one"}
            </Button>
          </Box>
          {mailbox.signature.trim() && (
            <Box sx={{ fontSize: 12.5, color: tokens.ink3 }} dangerouslySetInnerHTML={{ __html: sigHtml(mailbox.signature) }} />
          )}
        </Box>
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
      {sigOpen && (
        <SignatureDialog
          mailbox={mailbox}
          onClose={() => setSigOpen(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["mailboxes"] })}
        />
      )}
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
