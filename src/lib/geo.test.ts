import { describe, expect, it } from "vitest";
import { addressKey, distanceKm, nearby, areaKm, middleOf, placeOf, zonesFrom } from "./geo";

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
  it("gives a whole city more reach than a suburb", () => {
    expect(areaKm("Centurion")).toBeGreaterThan(areaKm("Lyttelton"));
  });
  it("joins suburbs that sit together into one circle, and keeps far-off places apart", () => {
    const zones = zonesFrom([
      { at: near, km: 4 },
      { at: { lat: -25.9, lng: 28.19 }, km: 4 },
      { at: { lat: -29.86, lng: 31.02 }, km: 14 },
    ]);
    expect(zones).toHaveLength(2);
    expect(zones.map((z) => Math.round(z.km)).sort()).toEqual([14, 6]);
  });
  it("says whether a lead is in their area, close by or further away", () => {
    const zones = [{ center: near, km: 5 }];
    expect(placeOf(near, zones)).toBe("in");
    expect(placeOf({ lat: -25.95, lng: 28.19 }, zones)).toBe("near");
    expect(placeOf({ lat: -29.86, lng: 31.02 }, zones)).toBe("far");
  });
  it("finds the middle without being pulled away by one far lead", () => {
    expect(middleOf([near, near, { lat: -33.9, lng: 18.4 }])).toEqual(near);
    expect(middleOf([])).toBeNull();
  });
});
