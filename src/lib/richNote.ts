import DOMPurify from "dompurify";

// To-dos and notes are a little HTML: bold, italic, underline, lists, links
// and screenshots. Only those survive, whatever is pasted in. A screenshot is
// kept as its private storage path (data-ek-path), never as a link that could
// be shared; a short-lived link is put in when it's shown.

const ALLOWED = {
  ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "a", "br", "p", "div", "ul", "ol", "li", "img"],
  ALLOWED_ATTR: ["href", "data-ek-path", "src", "alt"],
  ALLOW_DATA_ATTR: false,
};

/** Safe HTML, ready to show or save. Links open in a new tab; only https and mailto links survive. */
export function cleanNoteHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, { ...ALLOWED, ADD_ATTR: ["data-ek-path"], RETURN_DOM: true }) as HTMLElement;
  clean.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!/^(https:\/\/|mailto:)/i.test(href)) a.removeAttribute("href");
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });
  clean.querySelectorAll("img").forEach((img) => {
    if (!img.getAttribute("data-ek-path")) img.remove(); // only our own screenshots
  });
  return clean.innerHTML;
}

/** What to save: clean, with screenshots as paths only. */
export function noteForSaving(html: string): string {
  const box = document.createElement("div");
  box.innerHTML = cleanNoteHtml(html);
  box.querySelectorAll("img").forEach((img) => img.removeAttribute("src"));
  return box.innerHTML.trim();
}

/** Older notes are plain text: show them as typed. */
export function noteHtml(body: string): string {
  if (/^\s*</.test(body)) return cleanNoteHtml(body);
  const esc = body.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return esc.replace(/\n/g, "<br>");
}

/** Nothing written and no screenshot. */
export function isEmptyNote(html: string): boolean {
  const box = document.createElement("div");
  box.innerHTML = html;
  return !box.textContent?.trim() && !box.querySelector("img");
}

/** The paths of the screenshots in a note. */
export function notePaths(html: string): string[] {
  return [...html.matchAll(/data-ek-path="([^"]+)"/g)].map((m) => m[1]);
}
