import { describe, expect, it } from "vitest";
import { addressKey, distanceKm, nearby, areaKm, leadsByArea, middleOf } from "./geo";

const moreleta = { lat: -25.8235, lng: 28.2915 };
const faeryGlen = { lat: -25.7905, lng: 28.2905 };
const capeTown = { lat: -33.9249, lng: 18.4241 };

describe("geo", () => {
  it("measures distance in km", () => {
    expect(distanceKm(moreleta, faeryGlen)).toBeCloseTo(3.67, 1);
    expect(distanceKm(moreleta, moreleta)).toBe(0);
  });

  it("treats the same address the same, however it was typed", () => {
    expect(addressKey("  93 Third  Avenue, Rondebosch East ")).toBe("93 third avenue, rondebosch east");
  });

  it("keeps only what's close, closest first, and skips what has no location", () => {
    const items = [
      { name: "far", at: capeTown },
      { name: "none", at: null },
      { name: "near", at: faeryGlen },
      { name: "here", at: moreleta },
    ];
    expect(nearby(moreleta, items, 5).map((i) => i.name)).toEqual(["here", "near"]);
  });
});

describe("leads by area", () => {
  const near = { lat: -25.86, lng: 28.19 };
  const area = (name: string, at: { lat: number; lng: number }) => ({ name, at, km: 4 });
  it("counts each lead once, in its closest area, and the rest as outside", () => {
    const a = area("A", near);
    const b = area("B", { lat: -25.87, lng: 28.19 });
    const { counts, inArea, outside } = leadsByArea([{ lat: -25.871, lng: 28.19 }, { lat: -29.8, lng: 31 }], [a, b]);
    expect(inArea).toBe(1);
    expect(outside).toBe(1);
    expect(counts[0]).toEqual({ area: b, leads: 1 });
    expect(counts[1].leads).toBe(0);
  });
  it("gives a whole city more reach than a suburb", () => {
    expect(areaKm("Durban")).toBeGreaterThan(areaKm("Lyttelton"));
    const city = { name: "Centurion", at: near, km: areaKm("Centurion") };
    expect(leadsByArea([{ lat: -25.93, lng: 28.19 }], [city]).inArea).toBe(1);
  });
  it("finds the middle without being pulled away by one far lead", () => {
    expect(middleOf([near, near, { lat: -33.9, lng: 18.4 }])).toEqual(near);
    expect(middleOf([])).toBeNull();
  });
});
