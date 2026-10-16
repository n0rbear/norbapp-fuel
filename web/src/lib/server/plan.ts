import "server-only";
import type { FuelPoint, PlanRequest, PlanResponse } from "../api-types";
import { decodePolyline, RoutePath, type LatLng } from "../geo";
import { planRefuels } from "../trip";
import { computeRoute, countryAt } from "./osm";
import { fetchStations, providerFor } from "./stations";

const COUNTRY_SAMPLE_EVERY_KM = 2;
const COUNTRY_MAX_SAMPLES = 5_000;
const PATH_MAX_POINTS = 300;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

function simplify(points: LatLng[], max: number): LatLng[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

export async function buildPlan(req: PlanRequest): Promise<PlanResponse> {
  const warnings: string[] = [];

  // Round trip: come back to the origin through the destination, so the return
  // leg is a real route (not a mirrored distance).
  const places = req.roundTrip
    ? [req.origin, ...req.waypoints, req.destination, req.origin]
    : [req.origin, ...req.waypoints, req.destination];
  const optimize = req.optimizeWaypoints && !req.roundTrip;

  const route = await computeRoute(places, optimize);
  const distanceKm = route.distanceMeters / 1000;
  const path = new RoutePath(decodePolyline(route.encodedPolyline), distanceKm);
  const plan = planRefuels(distanceKm, req.vehicle);

  const fuelKms = [0, ...plan.stops.map((s) => s.km)];
  const fuelLocations = fuelKms.map((km) => path.pointAtKm(km));

  // Countries along the route (for vignettes) and at each fuel point, from
  // offline border data.
  const countries: string[] = [];
  for (const sample of path.sample(COUNTRY_SAMPLE_EVERY_KM, COUNTRY_MAX_SAMPLES)) {
    const c = countryAt(sample);
    if (c && !countries.includes(c)) countries.push(c);
  }
  const fuelCountries = fuelLocations.map(countryAt);

  const points: FuelPoint[] = await mapLimit(fuelKms.map((km, i) => ({ km, i })), 4, async ({ km, i }) => {
    const country = fuelCountries[i];
    const provider = providerFor(country);
    const base = {
      kind: i === 0 ? ("start" as const) : ("stop" as const),
      km,
      location: fuelLocations[i],
      country,
      provider,
    };
    if (!provider) return { ...base, stations: [], stationsError: null };
    try {
      return { ...base, stations: await fetchStations(provider, fuelLocations[i], req.fuelType), stationsError: null };
    } catch {
      return { ...base, stations: [], stationsError: "A kútlista most nem érhető el." };
    }
  });

  if (points.some((p) => !p.provider)) {
    warnings.push(
      "Élő kútárak csak Németországban és Ausztriában érhetők el; máshol a megadott alapár szerint számolunk.",
    );
  }

  return {
    distanceKm,
    durationSec: route.durationSec,
    plan,
    countries,
    points,
    path: simplify(path.points, PATH_MAX_POINTS),
    warnings,
  };
}
