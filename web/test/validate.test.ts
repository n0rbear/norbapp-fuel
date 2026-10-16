import { describe, expect, it } from "vitest";
import { MAX_WAYPOINTS, parsePlanRequest, parseTollsQuery } from "@/lib/validate";

const valid = {
  origin: { address: "Budapest" },
  destination: { location: { lat: 48.14, lng: 11.58 }, label: "München" },
  waypoints: [{ address: "Wien" }],
  roundTrip: false,
  optimizeWaypoints: true,
  fuelType: "diesel",
  currency: "HUF",
  vehicle: { consumption: 7.2, tankSize: 50, startLevelPct: 100, reservePct: 20 },
};

describe("parsePlanRequest", () => {
  it("accepts a valid request", () => {
    const r = parsePlanRequest(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.waypoints).toEqual([{ address: "Wien" }]);
      expect(r.value.destination).toEqual(valid.destination);
    }
  });

  it("accepts a coordinate origin", () => {
    expect(parsePlanRequest({ ...valid, origin: { location: { lat: 47.5, lng: 19 } } }).ok).toBe(true);
    expect(parsePlanRequest({ ...valid, origin: { location: { lat: 147.5, lng: 19 } } }).ok).toBe(false);
  });

  it.each([
    ["missing destination", { ...valid, destination: { address: " " } }],
    ["blank waypoint", { ...valid, waypoints: [{ address: "" }] }],
    ["unknown fuel", { ...valid, fuelType: "lpg" }],
    ["old fuel id", { ...valid, fuelType: "e5" }],
    ["non-EU currency", { ...valid, currency: "CHF" }],
    ["bad consumption", { ...valid, vehicle: { ...valid.vehicle, consumption: "7" } }],
    ["too many waypoints", { ...valid, waypoints: Array(MAX_WAYPOINTS + 1).fill({ address: "x" }) }],
    ["malformed waypoint", { ...valid, waypoints: ["Wien"] }],
    ["not an object", null],
  ])("rejects %s", (_, body) => {
    expect(parsePlanRequest(body).ok).toBe(false);
  });
});

describe("parseTollsQuery", () => {
  const q = (s: string) => parseTollsQuery(new URLSearchParams(s));

  it("parses a full query", () => {
    expect(q("countries=HU,AT,FR&days=3&highway_km=FR:512.4,AT:20&euro_class=6&currency=EUR")).toEqual({
      ok: true,
      value: {
        countries: ["HU", "AT", "FR"],
        days: 3,
        highwayKm: { FR: 512.4, AT: 20 },
        euroClass: "6",
        currency: "EUR",
      },
    });
  });

  it("treats a missing euro class as null", () => {
    const r = q("countries=HU&days=1&currency=HUF");
    expect(r.ok && r.value.euroClass).toBeNull();
  });

  it.each([
    ["no countries", "days=1&currency=EUR"],
    ["lowercase country", "countries=hu&days=1&currency=EUR"],
    ["zero days", "countries=HU&days=0&currency=EUR"],
    ["fractional days", "countries=HU&days=1.5&currency=EUR"],
    ["bad highway km", "countries=FR&days=1&highway_km=FR:abc&currency=EUR"],
    ["bad euro class", "countries=RO&days=1&euro_class=euro7&currency=EUR"],
    ["bad currency", "countries=HU&days=1&currency=USD"],
  ])("rejects %s", (_, s) => {
    expect(q(s).ok).toBe(false);
  });
});
