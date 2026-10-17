import "server-only";
import type { FuelPoint, PlanRequest, PlanResponse, PointPrices } from "../api-types";
import { msg, type AppMessage } from "../../i18n/message";
import { RoutePath, type LatLng } from "../geo";
import { motorwayKmByCountry } from "../motorway";
import { planRefuels } from "../trip";
import { pricesAt, supportedCountries } from "./fuel-api";
import { applyTollAvoidance } from "./avoid-tolls";
import { computeRoute, countryAt } from "./osm";

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

const none = (reason: AppMessage): PointPrices => ({ mode: "none", source: null, stations: [], estimate: null, e5InsteadOfE10: false, reason });

export async function buildPlan(req: PlanRequest): Promise<PlanResponse> {
  const warnings: AppMessage[] = [];

  // Round trip: come back to the origin through the destination, so the return
  // leg is a real route (not a mirrored distance).
  const places = req.roundTrip
    ? [req.origin, ...req.waypoints, req.destination, req.origin]
    : [req.origin, ...req.waypoints, req.destination];
  const optimize = req.optimizeWaypoints && !req.roundTrip;

  // Wake the price service while the route is being computed.
  const supportedPromise = supportedCountries();
  supportedPromise.catch(() => {});

  const fastest = await computeRoute(places, optimize);
  const { route, avoided, warnings: avoidWarnings } = await applyTollAvoidance(
    fastest,
    new Set(req.avoidTollCountries),
  );
  warnings.push(...avoidWarnings);
  const distanceKm = route.distanceMeters / 1000;
  const path = new RoutePath(route.points, distanceKm);
  const plan = planRefuels(distanceKm, req.vehicle, req.fillAtStart);

  const fuelKms = [0, ...plan.stops.map((s) => s.km)];
  const fuelLocations = fuelKms.map((km) => path.pointAtKm(km));

  // Countries along the route and at each fuel point, from offline border data.
  const countries = path.regionsAlong(countryAt);
  // Start and destination count even when tiny (Monaco, Vaduz): the 5 km
  // threshold is only meant to hide border-data slivers along the way.
  const startCountry = countryAt(path.points[0]);
  const endCountry = countryAt(path.points[path.points.length - 1]);
  if (startCountry && !countries.includes(startCountry)) countries.unshift(startCountry);
  if (endCountry && !countries.includes(endCountry)) countries.push(endCountry);
  const fuelCountries = fuelLocations.map(countryAt);
  const motorwayKm = motorwayKmByCountry(route.steps, countryAt);

  let supported: Set<string> | null = null;
  try {
    supported = await supportedPromise;
  } catch {
    warnings.push(msg("priceServiceDown"));
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
    if (!supported) return { ...base, prices: none(msg("reasonServiceDown")) };
    if (!country || !supported.has(country)) {
      return { ...base, prices: none(country ? msg("reasonNoPriceData", { country }) : msg("reasonUnknownCountry")) };
    }
    try {
      const result = await pricesOnce(country, fuelLocations[i], km > 0);
      rate = result.rate;
      return { ...base, prices: result.prices };
    } catch {
      return { ...base, prices: none(msg("reasonFetchFailed")) };
    }
  });

  if (points.some((p) => p.prices.mode === "none")) {
    warnings.push(msg("fallbackWhereNoPrice"));
  }
  const outside = countries.filter((c) => supported && !supported.has(c));
  if (outside.length > 0) {
    warnings.push(msg("noTollDataFor", { countries: outside.join(",") }));
  }

  return {
    distanceKm,
    durationSec: route.durationSec,
    plan,
    currency: req.currency,
    rate,
    countries,
    // Countries driven toll-free need no vignette or toll estimate.
    tollCountries: supported ? countries.filter((c) => supported.has(c) && !avoided.includes(c)) : [],
    avoidedTollCountries: avoided,
    motorwayKm,
    points,
    path: simplify(path.points, PATH_MAX_POINTS),
    warnings,
  };
}
