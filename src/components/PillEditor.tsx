import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { tokens } from "../theme";

// A message box where merge fields show as pills ("First name") inside the
// text instead of {{first_name}}. The value stays the plain {{field}} text the
// engine fills in; only the box draws it differently.
//
// The box is a contentEditable div. Text is kept as text nodes (newlines are
// "\n", shown by white-space: pre-wrap) and each field is a non-editable span,
// so the browser deletes a pill as one piece. Whatever the browser does to
// the DOM, it's read back with serialize(), so the value is always clean.

export interface PillEditorHandle {
  /** Add a field where the cursor is (or at the end when the box was never focused). */
  insertField: (field: string, token?: string) => void;
}

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** The words on a field's pill. */
  pillLabel: (field: string) => string;
  /** Fields that can't go in this message: their pills are red. */
  isBad?: (field: string) => boolean;
  minRows?: number;
}

const FIELD_RE = /\{\{\s*(\w+)\s*\}\}/g;

/** The plain {{field}} text the DOM stands for. */
function serialize(root: Node): string {
  let out = "";
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) out += (child as Text).data;
      else if (child instanceof HTMLElement) {
        if (child.dataset.field) out += `{{${child.dataset.field}}}`;
        else if (child.tagName === "BR") { if (!child.dataset.end) out += "\n"; }
        else if (child.tagName === "DIV" || child.tagName === "P") {
          // Some browsers wrap a new line in a div instead of inserting "\n".
          if (out && !out.endsWith("\n")) out += "\n";
          walk(child);
        } else walk(child);
      }
    });
  };
  walk(root);
  return out.replace(/ /g, " ").replace(/​/g, "");
}

export const PillEditor = forwardRef<PillEditorHandle, Props>(function PillEditor({ label, value, onChange, pillLabel, isBad, minRows = 4 }, ref) {
  const box = useRef<HTMLDivElement | null>(null);
  const shown = useRef<string | null>(null); // the value the DOM currently shows
  const saved = useRef<Range | null>(null); // the cursor, kept while a field button is tapped

  const pill = useCallback((field: string) => {
    const s = document.createElement("span");
    s.dataset.field = field;
    s.contentEditable = "false";
    s.className = isBad?.(field) ? "ek-pill ek-pill-bad" : "ek-pill";
    s.textContent = pillLabel(field);
    return s;
  }, [pillLabel, isBad]);

  /** Draw the value: text, pills, and an end marker so a trailing new line shows. */
  const render = useCallback((v: string) => {
    const el = box.current;
    if (!el) return;
    el.replaceChildren();
    let at = 0;
    for (const m of v.matchAll(FIELD_RE)) {
      if (m.index! > at) el.append(document.createTextNode(v.slice(at, m.index)));
      el.append(pill(m[1]));
      at = m.index! + m[0].length;
    }
    if (at < v.length) el.append(document.createTextNode(v.slice(at)));
    const end = document.createElement("br");
    end.dataset.end = "1";
    el.append(end);
    shown.current = v;
  }, [pill]);

  // Redraw when the value changes from outside (a field added, a Remove/Fix),
  // or when the pills' words or colours change. Typing doesn't redraw, so the
  // cursor stays put.
  useEffect(() => { if (value !== shown.current) render(value); }, [value, render]);
  useEffect(() => { render(shown.current ?? value); }, [pillLabel, isBad]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = () => {
    const el = box.current;
    if (!el) return;
    const v = serialize(el);
    shown.current = v;
    onChange(v);
  };

  const inBox = (r: Range) => !!box.current && box.current.contains(r.commonAncestorContainer);
  const remember = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && inBox(sel.getRangeAt(0))) saved.current = sel.getRangeAt(0).cloneRange();
  };
  useEffect(() => {
    document.addEventListener("selectionchange", remember);
    return () => document.removeEventListener("selectionchange", remember);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  /** Put nodes where the cursor is, then the cursor after them. */
  const insertNodes = (nodes: Node[], range?: Range | null) => {
    const el = box.current!;
    let r = range && inBox(range) ? range : null;
    if (!r) {
      r = document.createRange();
      const end = el.lastChild;
      if (end) r.setStartBefore(end); else r.setStart(el, 0);
      r.collapse(true);
    }
    r.deleteContents();
    for (const n of nodes) { r.insertNode(n); r.setStartAfter(n); r.collapse(true); }
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    saved.current = r.cloneRange();
    emit();
  };

  useImperativeHandle(ref, () => ({
    insertField(field, token) {
      const el = box.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      const r = saved.current && inBox(saved.current) ? saved.current : null;
      // Keep words apart: "Hi" + First name would read "HiThandi".
      let before = "";
      if (r) {
        const pre = document.createRange();
        pre.setStart(el, 0);
        pre.setEnd(r.startContainer, r.startOffset);
        const text = serialize(pre.cloneContents());
        if (text && !/\s$/.test(text)) before = " ";
      } else if (shown.current && !/\s$/.test(shown.current)) before = " ";
      const nodes: Node[] = [];
      if (before) nodes.push(document.createTextNode(before));
      // A token may be more than one field ("{{count}} {{leads_word}}").
      let at = 0;
      const t = token ?? `{{${field}}}`;
      for (const m of t.matchAll(FIELD_RE)) {
        if (m.index! > at) nodes.push(document.createTextNode(t.slice(at, m.index)));
        nodes.push(pill(m[1]));
        at = m.index! + m[0].length;
      }
      if (at < t.length) nodes.push(document.createTextNode(t.slice(at)));
      insertNodes(nodes, r);
    },
  }));

  const lineH = 1.5;
  return (
    <Box>
      <Typography component="label" id={`${label}-label`} sx={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "text.secondary", mb: 0.5 }}>{label}</Typography>
      <Box
        ref={box}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        data-value={value}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onInput={emit}
        onBlur={() => { emit(); render(shown.current ?? ""); }}
        onKeyDown={(e: React.KeyboardEvent) => {
          // A plain "\n" instead of the browser's own <div>/<br>.
          if (e.key === "Enter") {
            e.preventDefault();
            const sel = window.getSelection();
            insertNodes([document.createTextNode("\n")], sel && sel.rangeCount ? sel.getRangeAt(0) : null);
          }
        }}
        onPaste={(e: React.ClipboardEvent) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          const sel = window.getSelection();
          const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
          // Pasted {{fields}} become pills.
          const nodes: Node[] = [];
          let at = 0;
          for (const m of text.matchAll(FIELD_RE)) {
            if (m.index! > at) nodes.push(document.createTextNode(text.slice(at, m.index)));
            nodes.push(pill(m[1]));
            at = m.index! + m[0].length;
          }
          if (at < text.length) nodes.push(document.createTextNode(text.slice(at)));
          insertNodes(nodes, r);
        }}
        sx={{
          minHeight: `${minRows * lineH + 1.2}em`,
          p: "10px 12px",
          border: `1px solid ${tokens.outline}`,
          borderRadius: "6px",
          bgcolor: "background.paper",
          fontSize: 15,
          lineHeight: lineH,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          outline: "none",
          cursor: "text",
          "&:focus": { borderColor: "primary.main", boxShadow: (t) => `0 0 0 1px ${t.palette.primary.main}` },
          "& .ek-pill": {
            display: "inline-block",
            px: "7px",
            mx: "1px",
            borderRadius: "999px",
            bgcolor: tokens.primaryBg,
            color: tokens.primary,
            border: `1px solid ${tokens.primaryBorder}`,
            fontSize: "0.86em",
            fontWeight: 600,
            lineHeight: 1.55,
            verticalAlign: "1px",
            whiteSpace: "nowrap",
            userSelect: "all",
            cursor: "default",
          },
          "& .ek-pill-bad": { bgcolor: tokens.redTint, color: tokens.red, borderColor: tokens.redBorder, textDecoration: "line-through" },
        }}
      />
    </Box>
  );
});
