import "server-only";
import type { Currency, CurrencyInfo, PointPrices, TollEstimate } from "../api-types";
import type { LatLng } from "../geo";
import type { FuelType } from "../trip";
import { UserError } from "./env";
import { fetchJson, UpstreamError } from "./http";

// NorbApp FUEL-API (backend/ on feature/fuel-price-backend). It runs on a
// free Render instance that sleeps, so the first request can take ~60 s.
const FUEL_API_URL = (process.env.FUEL_API_URL || "https://norbapp-fuel-api-fra.onrender.com").replace(/\/$/, "");
const TIMEOUT_MS = 70_000;
const STATION_RADIUS_KM = 10;
const MAX_STATIONS = 8;

function url(path: string, params: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined && e[1] !== ""),
  );
  return `${FUEL_API_URL}${path}${query.size ? `?${query}` : ""}`;
}

let lastWakeUp = 0;

/** Fire-and-forget wake-up of the sleeping free instance, at most once a minute. */
export function wakeUp(): void {
  if (Date.now() - lastWakeUp < 60_000) return;
  lastWakeUp = Date.now();
  fetch(url("/health"), { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" }).catch(() => {});
}

// --- cached reference data ---

type Cached<T> = { value: T; expiresAt: number };
const cache = new Map<string, Cached<unknown>>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Cached<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await load();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

type CountriesResponse = { countries: { code: string; mode: "official" | "estimate" }[] };

/** EU country codes the FUEL-API knows (non-EU countries get a 404 there). */
export function supportedCountries(): Promise<Set<string>> {
  return cached("countries", 6 * 3600_000, async () => {
    const data = await fetchJson<CountriesResponse>("fuel-api", url("/api/countries"), {}, TIMEOUT_MS);
    return new Set(data.countries.map((c) => c.code));
  });
}

type CurrenciesResponse = { as_of: string; currencies: { code: Currency; name_hu: string; rate: number }[] };

export function currencies(): Promise<{ asOf: string; currencies: CurrencyInfo[] }> {
  return cached("currencies", 3600_000, async () => {
    const data = await fetchJson<CurrenciesResponse>("fuel-api", url("/api/currencies"), {}, TIMEOUT_MS);
    return {
      asOf: data.as_of,
      currencies: data.currencies.map((c) => ({ code: c.code, name: c.name_hu, rate: c.rate })),
    };
  });
}

// --- prices ---

type ApiStation = {
  id: string;
  name: string;
  brand: string | null;
  address: string | null;
  city: string | null;
  distance_km: number | null;
  price: number | null;
};

type PricesResponse = {
  mode: "official" | "estimate";
  source: string;
  fallback_reason?: string | null;
  /** Fuel the prices are actually for (E10 falls back to petrol where not published). */
  price_fuel?: string;
  stations?: ApiStation[];
  estimates?: { price: number; price_low: number; price_high: number; brand_tier: string; location: string }[];
  exchange_rate: { rate: number };
};

const E5_INSTEAD_OF_E10 = "Itt nincs külön E10-ár, E5 (95) árral számolunk.";

/**
 * /api/prices for the requested fuel. An API deployment that predates E10
 * rejects `fuel=e10` with 422; then the petrol (E5) price is used instead.
 */
async function fetchPrices(params: Record<string, string>, fuel: FuelType): Promise<{ data: PricesResponse; fuelNote: string | null }> {
  try {
    const data = await fetchJson<PricesResponse>("fuel-api", url("/api/prices", { ...params, fuel }), {}, TIMEOUT_MS);
    const substituted = fuel === "e10" && data.price_fuel !== undefined && data.price_fuel !== "e10";
    return { data, fuelNote: substituted ? E5_INSTEAD_OF_E10 : null };
  } catch (e) {
    if (fuel !== "e10" || !(e instanceof UpstreamError && e.status === 422)) throw e;
    const data = await fetchJson<PricesResponse>("fuel-api", url("/api/prices", { ...params, fuel: "petrol" }), {}, TIMEOUT_MS);
    return { data, fuelNote: E5_INSTEAD_OF_E10 };
  }
}

/**
 * Prices around a fuel point. Official countries return nearby stations;
 * the rest return one estimate for a mainstream brand (on the motorway for
 * stops along the route, in town at the start).
 */
export async function pricesAt(
  country: string,
  point: LatLng,
  fuel: FuelType,
  currency: Currency,
  onMotorway: boolean,
): Promise<{ prices: PointPrices; rate: number }> {
  const { data, fuelNote } = await fetchPrices(
    {
      country,
      lat: point.lat.toFixed(5),
      lng: point.lng.toFixed(5),
      radius_km: String(STATION_RADIUS_KM),
      currency,
    },
    fuel,
  );

  if (data.mode === "official" && data.stations && data.stations.length > 0) {
    const stations = data.stations
      .map((s) => ({
        id: s.id,
        name: s.brand?.trim() || s.name,
        address: [s.address, s.city].filter(Boolean).join(", "),
        distanceKm: s.distance_km,
        price: s.price !== null && s.price > 0 ? s.price : null,
        isOpen: null,
      }))
      .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
      .slice(0, MAX_STATIONS);
    return {
      prices: { mode: "official", source: data.source, stations, estimate: null, fuelNote },
      rate: data.exchange_rate.rate,
    };
  }

  // No stations nearby (or the official source failed): take the estimate.
  const location = onMotorway ? "highway" : "city";
  const { data: estimate, fuelNote: estimateNote } = await fetchPrices(
    { country, brand_tier: "mainstream", location, currency },
    fuel,
  );
  const e = estimate.estimates?.[0];
  if (!e) throw new UpstreamError("fuel-api", null, "missing estimate");
  return {
    prices: {
      mode: "estimate",
      source: "Becslés (EU Weekly Oil Bulletin)",
      stations: [],
      estimate: { price: e.price, low: e.price_low, high: e.price_high, location: onMotorway ? "highway" : "city" },
      fuelNote: estimateNote,
    },
    rate: estimate.exchange_rate.rate,
  };
}

// --- tolls ---

type TollsResponse = {
  as_of: string;
  currency: Currency;
  countries: {
    country: string;
    system: "vignette" | "distance" | "free";
    lines: { type: string; id?: string; label?: string; km?: number; estimate?: boolean; price: number }[];
    note?: string;
    subtotal: number;
  }[];
  total: number;
};

export async function estimateTolls(params: {
  countries: string[];
  days: number;
  highwayKm: Record<string, number>;
  euroClass: string | null;
  currency: Currency;
}): Promise<TollEstimate> {
  const highwayKm = Object.entries(params.highwayKm)
    .filter(([, km]) => km >= 1)
    .map(([c, km]) => `${c}:${Math.round(km)}`)
    .join(",");
  try {
    const data = await fetchJson<TollsResponse>(
      "fuel-api",
      url("/api/tolls/estimate", {
        countries: params.countries.join(","),
        days: String(params.days),
        highway_km: highwayKm,
        euro_class: params.euroClass ?? undefined,
        currency: params.currency,
      }),
      {},
      TIMEOUT_MS,
    );
    return {
      status: "ok",
      asOf: data.as_of,
      total: data.total,
      countries: data.countries.map((c) => ({
        country: c.country,
        system: c.system,
        subtotal: c.subtotal,
        lines: c.lines.map((l) => ({
          label:
            l.type === "distance"
              ? `Km-alapú díj, kb. ${Math.round(l.km ?? 0)} km díjköteles szakasz (becslés)`
              : (l.label ?? l.type),
          price: l.price,
        })),
      })),
    };
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 422) {
      // The only 422 we provoke with valid input is a missing euro class.
      return { status: "euro_class_required" };
    }
    if (e instanceof UpstreamError && e.status === 404) {
      throw new UserError("Ismeretlen ország az útdíjkérésben.", 400);
    }
    throw e;
  }
}
