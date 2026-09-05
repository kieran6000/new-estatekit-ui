// Loads the Google Maps Places library. It's loaded from a <script> tag in
// index.html <head> (key injected at build from VITE_GOOGLE_MAPS_KEY); this
// helper waits for it to be ready, and falls back to injecting the script if
// it isn't present. Resolves false when no key is configured.
const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;

let loadPromise: Promise<boolean> | null = null;

interface GWindow { google?: { maps?: { places?: unknown } } }
function ready(): boolean {
  return !!(window as unknown as GWindow).google?.maps?.places;
}

export function loadGooglePlaces(): Promise<boolean> {
  if (ready()) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<boolean>((resolve) => {
    // A maps script already in the document (the head tag) — wait for it.
    const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    const waitForReady = () => {
      let tries = 0;
      const iv = setInterval(() => {
        if (ready()) { clearInterval(iv); resolve(true); }
        else if (++tries > 50) { clearInterval(iv); resolve(false); } // ~5s
      }, 100);
    };
    if (existing) { waitForReady(); return; }

    if (!KEY) { resolve(false); return; }
    const s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places`;
    s.onload = () => resolve(ready());
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return loadPromise;
}
