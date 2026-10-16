import "server-only";
import type { FuelPoint, PlanRequest, PlanResponse, PointPrices } from "../api-types";
import { countryName } from "../countries";
import { decodePolyline, RoutePath, type LatLng } from "../geo";
import { motorwayKmByCountry } from "../motorway";
import { planRefuels } from "../trip";
import { pricesAt, supportedCountries } from "./fuel-api";
import { computeRoute, countryAt } from "./osm";

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

const none = (reason: string): PointPrices => ({ mode: "none", source: null, stations: [], estimate: null, fuelNote: null, reason });

export async function buildPlan(req: PlanRequest): Promise<PlanResponse> {
  const warnings: string[] = [];

  // Round trip: come back to the origin through the destination, so the return
  // leg is a real route (not a mirrored distance).
  const places = req.roundTrip
    ? [req.origin, ...req.waypoints, req.destination, req.origin]
    : [req.origin, ...req.waypoints, req.destination];
  const optimize = req.optimizeWaypoints && !req.roundTrip;

  // Wake the price service while the route is being computed.
  const supportedPromise = supportedCountries();
  supportedPromise.catch(() => {});

  const route = await computeRoute(places, optimize);
  const distanceKm = route.distanceMeters / 1000;
  const path = new RoutePath(decodePolyline(route.encodedPolyline), distanceKm);
  const plan = planRefuels(distanceKm, req.vehicle, req.fillAtStart);

  const fuelKms = [0, ...plan.stops.map((s) => s.km)];
  const fuelLocations = fuelKms.map((km) => path.pointAtKm(km));

  // Countries along the route and at each fuel point, from offline border data.
  const countries: string[] = [];
  for (const sample of path.sample(COUNTRY_SAMPLE_EVERY_KM, COUNTRY_MAX_SAMPLES)) {
    const c = countryAt(sample);
    if (c && !countries.includes(c)) countries.push(c);
  }
  const fuelCountries = fuelLocations.map(countryAt);
  const motorwayKm = motorwayKmByCountry(route.steps, countryAt);

  let supported: Set<string> | null = null;
  try {
    supported = await supportedPromise;
  } catch {
    warnings.push("Az árszolgáltatás most nem érhető el – a megadott alapárral számolunk, útdíj nélkül.");
  }

  let rate: number | null = req.currency === "EUR" ? 1 : null;
  // A fill-up before departure shares the start location: fetch its prices once.
  const priceRequests = new Map<string, ReturnType<typeof pricesAt>>();
  const pricesOnce = (country: string, at: LatLng, onMotorway: boolean) => {
    const key = `${country}:${at.lat.toFixed(4)},${at.lng.toFixed(4)}:${onMotorway}`;
    if (!priceRequests.has(key)) priceRequests.set(key, pricesAt(country, at, req.fuelType, req.currency, onMotorway));
    return priceRequests.get(key)!;
  };
  const points: FuelPoint[] = await mapLimit(fuelKms.map((km, i) => ({ km, i })), 4, async ({ km, i }) => {
    const country = fuelCountries[i];
    const base = { kind: i === 0 ? ("start" as const) : ("stop" as const), km, location: fuelLocations[i], country };
    if (!supported) return { ...base, prices: none("Az árszolgáltatás nem érhető el.") };
    if (!country || !supported.has(country)) {
      return { ...base, prices: none(country ? `${countryName(country)}: nincs áradat (nem EU-s ország).` : "Ismeretlen ország.") };
    }
    try {
      const result = await pricesOnce(country, fuelLocations[i], km > 0);
      rate = result.rate;
      return { ...base, prices: result.prices };
    } catch {
      return { ...base, prices: none("Az ár most nem kérhető le.") };
    }
  });

  if (points.some((p) => p.prices.mode === "none")) {
    warnings.push("Ahol nincs áradat, a megadott alapárral számolunk.");
  }
  const outside = countries.filter((c) => supported && !supported.has(c));
  if (outside.length > 0) {
    warnings.push(`Nem EU-s országok útdíja nincs benne: ${outside.map(countryName).join(", ")}.`);
  }

  return {
    distanceKm,
    durationSec: route.durationSec,
    plan,
    currency: req.currency,
    rate,
    countries,
    tollCountries: supported ? countries.filter((c) => supported.has(c)) : [],
    motorwayKm,
    points,
    path: simplify(path.points, PATH_MAX_POINTS),
    warnings,
  };
}
