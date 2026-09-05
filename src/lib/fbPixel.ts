// Meta Pixel helpers. The base loader (window.fbq) is defined in index.html,
// so it appears in the page source; here we init the agent's own pixel and
// fire events at runtime.

type Fbq = (...args: unknown[]) => void;
interface FbWindow { fbq?: Fbq; __ekPixel?: string }

function digitsOnly(id: string): string {
  return (id || "").replace(/\D/g, "");
}

/** Init an agent's pixel (once) and fire PageView. Adds a <noscript> fallback. */
export function initPixel(rawId: string | null | undefined): string | null {
  const id = digitsOnly(rawId || "");
  const w = window as unknown as FbWindow;
  if (!id || typeof w.fbq !== "function" || w.__ekPixel === id) return id || null;
  w.__ekPixel = id;
  w.fbq("init", id);
  w.fbq("track", "PageView");
  if (!document.getElementById("fb-pixel-noscript")) {
    const ns = document.createElement("noscript");
    ns.id = "fb-pixel-noscript";
    ns.innerHTML = `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${encodeURIComponent(id)}&ev=PageView&noscript=1"/>`;
    document.head.appendChild(ns);
  }
  return id;
}

/** Fire a standard event (e.g. "Lead"). Safe no-op if the pixel isn't loaded. */
export function trackPixel(event: string): void {
  const w = window as unknown as FbWindow;
  if (typeof w.fbq === "function") w.fbq("track", event);
}
