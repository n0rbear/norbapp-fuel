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
  location: null,
});

const point = (stations: Station[], kind: FuelPoint["kind"] = "stop"): FuelPoint => ({
  kind,
  km: kind === "start" ? 0 : 300,
  location: { lat: 0, lng: 0 },
  country: "DE",
  prices: stations.length
    ? { mode: "official", source: "Tankerkoenig (MTS-K)", stations, estimate: null, e5InsteadOfE10: false }
    : { mode: "none", source: null, stations: [], estimate: null, e5InsteadOfE10: false, reason: { code: "reasonFetchFailed" } },
});

const estimated = (price: number): FuelPoint => ({
  kind: "stop",
  km: 400,
  location: { lat: 0, lng: 0 },
  country: "HU",
  prices: {
    mode: "estimate",
    source: "Becslés",
    stations: [],
    estimate: { price, low: price * 0.965, high: price * 1.035, location: "highway" },
    e5InsteadOfE10: false,
  },
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

  it("uses the estimate where there are no stations", () => {
    expect(resolvePrices([estimated(740.32)], { manualPrice: null, defaultPrice: 600, selected: {} })).toEqual([
      { price: 740.32, source: "estimate" },
    ]);
  });

  it("prices the start tank at the local median, not a picked station", () => {
    const start = point([station("a", 1.8), station("b", 1.9), station("c", 2.3), station("d", null)], "start");
    expect(resolvePrices([start], { manualPrice: null, defaultPrice: 1.7, selected: { 0: "a" } })).toEqual([
      { price: 1.9, source: "average" },
    ]);
  });

  it("prices the start tank by estimate, then default, without stations", () => {
    const est = { ...estimated(1.75), kind: "start" as const, km: 0 };
    expect(resolvePrices([est, point([], "start")], { manualPrice: null, defaultPrice: 1.7, selected: {} })).toEqual([
      { price: 1.75, source: "estimate" },
      { price: 1.7, source: "default" },
    ]);
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

describe("resolvePrices with community stations", () => {
  const base = { manualPrice: null, defaultPrice: 1.7 };
  const c = (id: string, price: number, priceKind: "confirmed" | "learned" | "estimate") => ({ id, price, priceKind });

  it("keeps the average when nothing has been confirmed nearby", () => {
    const [p] = resolvePrices([estimated(1.75)], { ...base, selected: {}, community: { 0: [c("x", 1.75, "estimate")] } });
    expect(p).toEqual({ price: 1.75, source: "estimate" });
  });

  it("uses the stations' prices once some are confirmed or learned", () => {
    const community = { 0: [c("x", 1.6, "confirmed"), c("y", 1.7, "estimate"), c("z", 1.65, "learned")] };
    expect(resolvePrices([estimated(1.75)], { ...base, selected: {}, community })[0]).toEqual({ price: 1.65, source: "community" });
  });

  it("uses a chosen station's price", () => {
    const community = { 0: [c("x", 1.6, "confirmed"), c("y", 1.7, "estimate")] };
    expect(resolvePrices([estimated(1.75)], { ...base, selected: { 0: "y" }, community })[0]).toEqual({ price: 1.7, source: "station" });
  });
});
