import { useEffect, useRef, useState } from "react";
import { Box, IconButton, Paper, Popper, Tooltip } from "@mui/material";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import { matchSops, slashQuery, SOP_DOC, type Sop } from "../lib/sops";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import LinkIcon from "@mui/icons-material/Link";
import { supabase } from "../api/_client";
import { useSnack } from "../hooks/useSnack";
import { shrinkImage } from "../lib/image";
import { cleanNoteHtml, noteHtml, notePaths } from "../lib/richNote";
import { tokens } from "../theme";

// A note you can format like a document: bold, italic, underline, lists, links
// and screenshots (paste, drop or pick one). It looks like a plain text box
// until you're in it; the few buttons only show then.

const BUCKET = "client-notes";
const LINK_MINUTES = 60;

/** Short-lived links for a note's screenshots, keyed by their storage path. */
async function signedLinks(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, LINK_MINUTES * 60);
  return Object.fromEntries((data ?? []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as [string, string]] : [])));
}

/** Puts the short-lived links into a note's screenshots. */
async function withImages(html: string): Promise<string> {
  const links = await signedLinks(notePaths(html));
  return html.replace(/<img([^>]*?)data-ek-path="([^"]+)"([^>]*)>/g, (m, a, path, b) => (links[path] ? `<img${a}data-ek-path="${path}" src="${links[path]}"${b}>` : m));
}

const NOTE_STYLE = {
  fontSize: 14.5,
  lineHeight: 1.5,
  overflowWrap: "anywhere",
  "& p, & div": { m: 0 },
  "& ul, & ol": { my: 0.5, pl: 2.5 },
  "& a": { color: "primary.main" },
  "& img": { display: "block", maxWidth: "100%", maxHeight: 360, borderRadius: "6px", border: `1px solid ${tokens.divider}`, my: 0.75, cursor: "zoom-in" },
  // An SOP link reads as a chip: "📄 Ad setup".
  [`& a[href^="${SOP_DOC}"]`]: {
    display: "inline-flex", alignItems: "center", gap: "4px", px: "7px", py: "1px", borderRadius: "999px",
    bgcolor: tokens.surface2, border: `1px solid ${tokens.divider}`, color: "text.primary",
    fontSize: "0.92em", fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap", verticalAlign: "baseline",
    "&::before": { content: '"📄"', fontSize: "0.9em" },
    "&:hover": { borderColor: tokens.primary, color: tokens.primary },
  },
} as const;

/** A saved note, shown. Screenshots open full size in a new tab. */
export function NoteView({ body, muted }: { body: string; muted?: boolean }) {
  const [html, setHtml] = useState(() => noteHtml(body));
  useEffect(() => {
    let gone = false;
    const clean = noteHtml(body);
    setHtml(clean);
    if (notePaths(clean).length) void withImages(clean).then((h) => { if (!gone) setHtml(h); });
    return () => { gone = true; };
  }, [body]);
  return (
    <Box
      sx={{ ...NOTE_STYLE, color: muted ? tokens.ink3 : "text.primary", textDecoration: muted ? "line-through" : "none" }}
      onClick={(e) => { const t = e.target as HTMLElement; if (t.tagName === "IMG") window.open((t as HTMLImageElement).src, "_blank", "noopener"); }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** The editor. `folder` keeps a client's screenshots together. */
export function NoteEditor({ initial = "", folder, placeholder, onChange, autoFocus }: { initial?: string; folder: string; placeholder: string; onChange: (html: string) => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const showSnack = useSnack();
  const [focused, setFocused] = useState(false);
  const [empty, setEmpty] = useState(!initial);
  const [uploading, setUploading] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const clean = initial ? noteHtml(initial) : "";
    ref.current.innerHTML = clean;
    if (notePaths(clean).length) void withImages(clean).then((h) => { if (ref.current && ref.current.innerHTML === clean) ref.current.innerHTML = h; });
    if (autoFocus) ref.current.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "/" opens a list of SOPs; picking one puts in a link to it.
  const [slash, setSlash] = useState<{ query: string; rect: DOMRect } | null>(null);
  const [pick, setPick] = useState(0);
  const slashAt = useRef<{ node: Node; start: number; end: number } | null>(null);
  const sops = slash ? matchSops(slash.query) : [];

  const lookForSlash = () => {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!sel || !sel.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !ref.current?.contains(node)) { setSlash(null); return; }
    const end = sel.anchorOffset;
    const query = slashQuery((node.textContent ?? "").slice(0, end));
    if (query === null) { setSlash(null); return; }
    slashAt.current = { node, start: end - query.length - 1, end };
    const range = document.createRange();
    range.setStart(node, end - query.length - 1);
    range.setEnd(node, end);
    const rect = range.getClientRects()[0] ?? ref.current.getBoundingClientRect();
    setSlash((was) => { if (!was || was.query !== query) setPick(0); return { query, rect }; });
  };

  const putSop = (sop: Sop) => {
    const at = slashAt.current;
    const sel = window.getSelection();
    if (at && sel && ref.current?.contains(at.node)) {
      const range = document.createRange();
      range.setStart(at.node, Math.max(0, at.start));
      range.setEnd(at.node, Math.min(at.end, at.node.textContent?.length ?? at.end));
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand("insertHTML", false, `<a href="${sop.url}">${sop.name}</a>&nbsp;`);
    setSlash(null);
    changed();
  };

  const changed = () => {
    const html = ref.current?.innerHTML ?? "";
    setEmpty(!ref.current?.textContent?.trim() && !ref.current?.querySelector("img"));
    onChange(html);
  };
  const run = (cmd: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, value);
    changed();
  };
  const addLink = () => {
    const url = window.prompt("Paste the link (starting with https://)");
    if (!url) return;
    if (!/^https:\/\/\S+$/i.test(url.trim())) { showSnack("Links need to start with https://"); return; }
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && ref.current?.contains(sel.anchorNode)) run("createLink", url.trim());
    else run("insertHTML", cleanNoteHtml(`<a href="${url.trim().replace(/"/g, "%22")}">${url.trim().replace(/[<>]/g, "")}</a>&nbsp;`));
  };

  async function addImages(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    ref.current?.focus();
    for (const file of images) {
      setUploading((n) => n + 1);
      try {
        const blob = await shrinkImage(file, "screenshot");
        const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
        const path = `${folder}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || file.type });
        if (error) throw error;
        const links = await signedLinks([path]);
        document.execCommand("insertHTML", false, `<img data-ek-path="${path}" src="${links[path] ?? ""}" alt="Screenshot"><br>`);
        changed();
      } catch (e) {
        console.error("note image upload failed", e);
        showSnack("That picture didn't upload. Try again.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const tool = (title: string, icon: React.ReactNode, act: () => void) => (
    <Tooltip title={title}>
      <IconButton size="small" aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={act}>{icon}</IconButton>
    </Tooltip>
  );

  return (
    <Box sx={{ position: "relative", border: `1px solid ${focused ? tokens.primary : tokens.outline}`, boxShadow: focused ? `0 0 0 1px ${tokens.primary}` : "none", borderRadius: "4px", bgcolor: "background.paper" }}>
      <Box
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setSlash(null); }}
        onInput={() => { changed(); lookForSlash(); }}
        onKeyDown={(e) => {
          if (!slash || !sops.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setPick((p) => (p + 1) % sops.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setPick((p) => (p - 1 + sops.length) % sops.length); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); putSop(sops[Math.min(pick, sops.length - 1)]); }
          else if (e.key === "Escape") { e.preventDefault(); setSlash(null); }
        }}
        onPaste={(e) => {
          const files = [...e.clipboardData.files];
          if (files.some((f) => f.type.startsWith("image/"))) { e.preventDefault(); void addImages(files); return; }
          const html = e.clipboardData.getData("text/html");
          if (html) { e.preventDefault(); document.execCommand("insertHTML", false, cleanNoteHtml(html)); changed(); }
        }}
        onDrop={(e) => {
          const files = [...e.dataTransfer.files];
          if (files.length) { e.preventDefault(); void addImages(files); }
        }}
        sx={{ ...NOTE_STYLE, minHeight: 64, px: 1.5, py: 1, outline: "none", "& img": { ...NOTE_STYLE["& img"], cursor: "default" } }}
      />
      {empty && (
        <Box sx={{ position: "absolute", top: 8, left: 12, right: 12, color: tokens.ink3, fontSize: 14.5, pointerEvents: "none" }}>{placeholder}</Box>
      )}
      <Popper
        open={!!slash && sops.length > 0}
        anchorEl={slash ? { getBoundingClientRect: () => slash.rect } : null}
        placement="bottom-start"
        sx={{ zIndex: 1500 }}
      >
        <Paper elevation={6} role="listbox" aria-label="SOPs" sx={{ mt: 0.5, py: 0.5, minWidth: 220, borderRadius: "8px" }}>
          <Box sx={{ px: 1.5, pt: 0.25, pb: 0.5, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: tokens.ink3 }}>Link an SOP</Box>
          {sops.map((s, i) => (
            <Box
              key={s.url}
              role="option"
              aria-selected={i === pick}
              onMouseDown={(e) => { e.preventDefault(); putSop(s); }}
              onMouseEnter={() => setPick(i)}
              sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.75, fontSize: 14, cursor: "pointer", bgcolor: i === pick ? tokens.hover : "transparent" }}
            >
              <DescriptionOutlinedIcon sx={{ fontSize: 17, color: tokens.ink3 }} />{s.name}
            </Box>
          ))}
        </Paper>
      </Popper>
      {(focused || !empty || uploading > 0) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, px: 0.5, py: 0.25, borderTop: `1px solid ${tokens.divider2}` }}>
          {tool("Bold", <FormatBoldIcon fontSize="small" />, () => run("bold"))}
          {tool("Italic", <FormatItalicIcon fontSize="small" />, () => run("italic"))}
          {tool("Underline", <FormatUnderlinedIcon fontSize="small" />, () => run("underline"))}
          {tool("List", <FormatListBulletedIcon fontSize="small" />, () => run("insertUnorderedList"))}
          {tool("Add a link", <LinkIcon fontSize="small" />, addLink)}
          {tool("Link an SOP (or type /)", <DescriptionOutlinedIcon fontSize="small" />, () => {
            ref.current?.focus();
            const sel = window.getSelection();
            const node = sel?.anchorNode;
            const before = node && node.nodeType === Node.TEXT_NODE ? (node.textContent ?? "").slice(0, sel!.anchorOffset) : "";
            document.execCommand("insertText", false, before && !/\s$/.test(before) ? " /" : "/");
            changed();
            lookForSlash();
          })}
          {tool("Add a screenshot (or paste one)", <ImageOutlinedIcon fontSize="small" />, () => fileRef.current?.click())}
          {uploading > 0 && <Box component="span" sx={{ fontSize: 12.5, color: tokens.ink2, ml: 1 }}>Adding picture…</Box>}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void addImages([...(e.target.files ?? [])]); e.target.value = ""; }} />
        </Box>
      )}
    </Box>
  );
}
