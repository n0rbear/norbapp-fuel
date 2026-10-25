import { describe, expect, it } from "vitest";
import { countryBbox, countryTiles } from "@/lib/server/osm";

describe("countryTiles", () => {
  it("covers small and mid-sized countries with a sensible number of tiles", () => {
    expect(countryTiles("LI").length).toBeGreaterThanOrEqual(1);
    expect(countryTiles("MC").length).toBeGreaterThanOrEqual(1);
    const lu = countryTiles("LU").length;
    expect(lu).toBeGreaterThanOrEqual(2);
    expect(lu).toBeLessThanOrEqual(9);
    const hu = countryTiles("HU").length;
    expect(hu).toBeGreaterThan(40);
    expect(hu).toBeLessThan(90);
  });

  it("keeps to the European part of a country", () => {
    const [s, w, n, e] = countryBbox("NL")!;
    expect(s).toBeGreaterThan(50);
    expect(n).toBeLessThan(55);
    expect(w).toBeGreaterThan(2);
    expect(e).toBeLessThan(8);
  });

  it("covers Budapest and a Hungarian motorway point", () => {
    const tiles = countryTiles("HU");
    const covered = (lat: number, lng: number) => tiles.some(([s, w, n, e]) => lat >= s && lat < n && lng >= w && lng < e);
    expect(covered(47.4979, 19.0402)).toBe(true);
    expect(covered(47.68, 17.65)).toBe(true);
  });
});
