import "server-only";
import type { CommunityStation, Currency } from "../api-types";
import type { LatLng } from "../geo";
import { haversineKm } from "../geo";
import type { FuelType } from "../trip";
import { communityEnabled, lookupStations, scheduleImports, stationsFromDb } from "./community-db";
import { baselineEur, estimateCountries, eurRate } from "./fuel-api";
import { fuelStationsNear } from "./osm";

const RADIUS_KM = 6;
const MAX_STATIONS = 8;

/** Stations around a fuel point in an average-price country, with their best known price. */
export async function communityStations(
  country: string,
  point: LatLng,
  fuel: FuelType,
  currency: Currency,
  where: "city" | "highway",
): Promise<{ stations: CommunityStation[]; reportable: boolean }> {
  // Imported copy first (fast, reliable); live Overpass until the country is imported.
  void estimateCountries().then((cs) => scheduleImports([country, ...[...cs].filter((c) => c !== country).sort()]), () => {});
  const fromDb = await stationsFromDb(country, point, RADIUS_KM).catch(() => null);
  const [osm, baseline, rate] = await Promise.all([
    fromDb ?? fuelStationsNear(point, RADIUS_KM),
    baselineEur(country, fuel, where),
    eurRate(currency),
  ]);
  if (baseline === null) return { stations: [], reportable: false };
  const nearest = osm
    .map((s) => ({ ...s, distanceKm: haversineKm(point, s.location) }))
    .filter((s) => s.distanceKm <= RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_STATIONS);
  const known = await lookupStations(fuel, point, nearest, baseline);
  const round = (eur: number) => Math.round(eur * rate * 1000) / 1000;
  const stations = nearest.map((s): CommunityStation => {
    const info = known.get(s.id)!;
    const p = info.price;
    return {
      id: s.id,
      name: s.name,
      address: s.address,
      distanceKm: Math.round(s.distanceKm * 10) / 10,
      location: s.location,
      price: round(p.price),
      priceKind: p.kind,
      confirmedAt: p.kind === "estimate" ? null : new Date(p.confirmedAt).toISOString(),
      reporters: p.kind === "estimate" ? 0 : p.reporters,
      pending: info.pending ? { price: round(info.pending.price), count: info.pending.count } : null,
    };
  });
  return { stations, reportable: communityEnabled };
}
