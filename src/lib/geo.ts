export interface LatLng { lat: number; lng: number }

/** Straight-line distance in km. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** The same address however it was typed, for looking it up once. */
export const addressKey = (address: string) => address.trim().toLowerCase().replace(/\s+/g, " ");

/** Those within reach of a point, closest first, with how far each is. */
export function nearby<T extends { at: LatLng | null }>(from: LatLng, items: T[], withinKm: number): (T & { km: number })[] {
  return items
    .flatMap((i) => (i.at ? [{ ...i, km: distanceKm(from, i.at) }] : []))
    .filter((i) => i.km <= withinKm)
    .sort((x, y) => x.km - y.km);
}
