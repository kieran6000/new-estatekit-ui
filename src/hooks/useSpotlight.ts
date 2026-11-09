import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

// "Take me to where I fix this": an empty state links to a page with
// ?spot=<section> (or ?spot=<section>.<field>). That section scrolls into
// view, glows for a moment and, if it can be edited, opens with that field
// ready to type in. The ?spot goes away again afterwards.

export const spotSx = (on: boolean) => ({
  transition: "box-shadow 400ms ease",
  boxShadow: on ? "0 0 0 3px rgba(26, 86, 219, 0.55), 0 0 0 9px rgba(26, 86, 219, 0.14)" : "none",
});

/** The link: the same page, another tab, with what to light up. */
export const spotLink = (path: string, spot: string) => `${path}?spot=${encodeURIComponent(spot)}`;

export function useSpotlight<T extends HTMLElement = HTMLDivElement>(id: string | undefined) {
  const [params, setParams] = useSearchParams();
  const [wanted] = useState(() => {
    const [section, field] = (params.get("spot") ?? "").split(".");
    return id && section === id ? { field: field || undefined } : null;
  });
  const ref = useRef<T | null>(null);
  const [glow, setGlow] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    const show = setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setGlow(true);
    }, 250);
    const fade = setTimeout(() => {
      setGlow(false);
      setParams((cur) => { const n = new URLSearchParams(cur); n.delete("spot"); return n; }, { replace: true });
    }, 2800);
    return () => { clearTimeout(show); clearTimeout(fade); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ref, glow, spotted: !!wanted, field: wanted?.field };
}
