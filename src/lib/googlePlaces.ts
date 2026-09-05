// Loads the Google Maps Places library once. Returns false if no API key is
// configured, so callers fall back to a plain text field.
const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;

let loadPromise: Promise<boolean> | null = null;

interface GWindow { google?: { maps?: { places?: unknown } } }

export function loadGooglePlaces(): Promise<boolean> {
  const w = window as unknown as GWindow;
  if (w.google?.maps?.places) return Promise.resolve(true);
  if (!KEY) return Promise.resolve(false);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<boolean>((resolve) => {
    const s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places`;
    s.onload = () => resolve(!!w.google?.maps?.places);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return loadPromise;
}
