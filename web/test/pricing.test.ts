import { describe, expect, it } from "vitest";
import type { FuelPoint, Station } from "@/lib/api-types";
import { parseDecimal, resolvePrices } from "@/lib/pricing";

const station = (id: string, price: number | null): Station => ({
  id,
  name: id,
  address: "",
  distanceKm: 1,
  price,
  isOpen: true,
});

const point = (stations: Station[]): FuelPoint => ({
  kind: "start",
  km: 0,
  location: { lat: 0, lng: 0 },
  country: "DE",
  provider: "tankerkoenig",
  stations,
  stationsError: null,
});

describe("resolvePrices", () => {
  const points = [point([station("a", null), station("b", 1.8), station("c", 1.9)]), point([])];

  it("uses the cheapest priced station, then the default", () => {
    expect(resolvePrices(points, { manualPrice: null, defaultPrice: 1.7, selected: {} })).toEqual([
      { price: 1.8, source: "cheapest" },
      { price: 1.7, source: "default" },
    ]);
  });

  it("prefers the selected station", () => {
    expect(resolvePrices(points, { manualPrice: null, defaultPrice: 1.7, selected: { 0: "c" } })[0]).toEqual({
      price: 1.9,
      source: "station",
    });
  });

  it("lets the manual price override everything", () => {
    const prices = resolvePrices(points, { manualPrice: 1.5, defaultPrice: 1.7, selected: { 0: "c" } });
    expect(prices.every((p) => p.price === 1.5 && p.source === "manual")).toBe(true);
  });
});

describe("parseDecimal", () => {
  it("accepts comma and dot decimals", () => {
    expect(parseDecimal("1,72")).toBe(1.72);
    expect(parseDecimal(" 1.72 ")).toBe(1.72);
    expect(parseDecimal("50")).toBe(50);
  });

  it("rejects blanks and garbage", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("1,2,3")).toBeNull();
    expect(parseDecimal("-1")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
  });
});
