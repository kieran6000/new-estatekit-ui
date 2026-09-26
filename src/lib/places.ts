// South African city and suburb lookups for the /start form, using Photon
// (photon.komoot.io, free OpenStreetMap search built for autocomplete).
// Every call is best-effort: on any failure it returns [] and the form falls
// back to plain typing, so a lookup problem can never block a sign-up.

const PHOTON = "https://photon.komoot.io";
const ZA_BBOX = "16.3,-35.0,33.0,-22.0";

export interface Place {
  name: string;
  /** Where it is, for telling same-named places apart, e.g. "Pretoria" or "Gauteng". */
  detail: string;
  lat: number;
  lon: number;
}

/** Big metros and towns first, so most people tap instead of typing.
 *  Coordinates only centre the suburb suggestions. */
export const POPULAR_CITIES: Place[] = [
  { name: "Johannesburg", detail: "Gauteng", lat: -26.2041, lon: 28.0473 },
  { name: "Pretoria", detail: "Gauteng", lat: -25.7479, lon: 28.2293 },
  { name: "Centurion", detail: "Gauteng", lat: -25.8603, lon: 28.1894 },
  { name: "Cape Town", detail: "Western Cape", lat: -33.9249, lon: 18.4241 },
  { name: "Durban", detail: "KwaZulu-Natal", lat: -29.8587, lon: 31.0218 },
  { name: "Gqeberha", detail: "Eastern Cape", lat: -33.9608, lon: 25.6022 },
  { name: "Bloemfontein", detail: "Free State", lat: -29.0852, lon: 26.1596 },
  { name: "Pietermaritzburg", detail: "KwaZulu-Natal", lat: -29.6006, lon: 30.3794 },
];

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; countrycode?: string; state?: string; city?: string; county?: string };
}

async function photon(path: string, signal?: AbortSignal): Promise<PhotonFeature[]> {
  try {
    const res = await fetch(`${PHOTON}${path}`, { signal });
    if (!res.ok) return [];
    const j = await res.json();
    return (j?.features ?? []) as PhotonFeature[];
  } catch {
    return [];
  }
}

function toPlaces(features: PhotonFeature[], detailOf: (p: PhotonFeature["properties"]) => string): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const f of features) {
    const p = f.properties;
    if (p.countrycode !== "ZA" || !p.name) continue;
    const key = p.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: p.name, detail: detailOf(p), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] });
  }
  return out;
}

export async function searchCities(q: string, signal?: AbortSignal): Promise<Place[]> {
  if (q.trim().length < 2) return [];
  const f = await photon(
    `/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&bbox=${ZA_BBOX}&osm_tag=place:city&osm_tag=place:town`,
    signal,
  );
  return toPlaces(f, (p) => p.state || "").slice(0, 6);
}

export async function searchSuburbs(q: string, near: { lat: number; lon: number } | null, signal?: AbortSignal): Promise<Place[]> {
  if (q.trim().length < 2) return [];
  const bias = near ? `&lat=${near.lat}&lon=${near.lon}` : "";
  const f = await photon(
    `/api/?q=${encodeURIComponent(q)}&limit=10&lang=en&bbox=${ZA_BBOX}${bias}` +
      `&osm_tag=place:suburb&osm_tag=place:neighbourhood&osm_tag=place:quarter&osm_tag=place:village&osm_tag=place:town`,
    signal,
  );
  return toPlaces(f, (p) => p.city || p.county || p.state || "").slice(0, 6);
}

/** Suburbs around a city's centre, nearest first: the tap-to-add suggestions. */
export async function nearbySuburbs(near: { lat: number; lon: number }, signal?: AbortSignal): Promise<string[]> {
  const f = await photon(`/reverse?lat=${near.lat}&lon=${near.lon}&limit=30&radius=12&lang=en&osm_tag=place:suburb`, signal);
  return toPlaces(f, () => "")
    .map((p) => p.name)
    // "Lyttleton A.H." style agricultural-holding entries aren't how agents name areas.
    .filter((n) => !/\b(A\.?H\.?|L\.?H\.?|Ext\.?\s*\d*)$/i.test(n))
    .slice(0, 12);
}
