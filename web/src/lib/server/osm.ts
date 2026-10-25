import "server-only";
import { feature, iso1A2Code } from "@rapideditor/country-coder";
import type { PlaceInput, PlaceSuggestion } from "../api-types";
import { decodePolyline, type LatLng } from "../geo";
import { msg } from "../../i18n/message";
import { UserError } from "./env";
import { fetchJson, UpstreamError } from "./http";

// Public OpenStreetMap-based services. Both can be self-hosted later and
// pointed to via env vars without code changes.
const OSRM_URL = process.env.OSRM_URL || "https://routing.openstreetmap.de/routed-car";
const PHOTON_URL = process.env.PHOTON_URL || "https://photon.komoot.io";
// The public instances' usage policies require an identifying User-Agent.
const HEADERS = { "User-Agent": "NorbApp-Fuel/1.0 (+https://fuel.norbapp.com)" };

/** ISO 3166-1 alpha-2 code at a coordinate (offline border data), or null at sea. */
export function countryAt(point: LatLng): string | null {
  return iso1A2Code([point.lng, point.lat]) ?? null;
}

// --- Photon (geocoding) ---

type PhotonResponse = {
  features?: {
    geometry: { coordinates: [number, number] };
    properties: {
      name?: string;
      street?: string;
      housenumber?: string;
      postcode?: string;
      city?: string;
      town?: string;
      village?: string;
      county?: string;
      country?: string;
    };
  }[];
};

function labelOf(p: NonNullable<PhotonResponse["features"]>[number]["properties"]): string {
  const locality = p.city ?? p.town ?? p.village;
  const street = [p.street, p.housenumber].filter(Boolean).join(" ");
  const place = [p.postcode, locality].filter(Boolean).join(" ");
  const name = p.name && p.name !== locality ? p.name : undefined;
  const parts: string[] = [];
  for (const part of [name, street, place || p.county, p.country]) {
    if (part && !parts.some((x) => x.includes(part))) parts.push(part);
  }
  return parts.join(", ");
}

async function photon(path: string, params: Record<string, string>): Promise<PlaceSuggestion[]> {
  const data = await fetchJson<PhotonResponse>(
    "photon",
    `${PHOTON_URL}${path}?${new URLSearchParams(params)}`,
    { headers: HEADERS },
    6_000,
  );
  return (data.features ?? []).map((f) => ({
    label: labelOf(f.properties),
    location: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
  }));
}

export async function autocomplete(q: string, near?: LatLng): Promise<PlaceSuggestion[]> {
  const params: Record<string, string> = { q, limit: "6" };
  // zoom=4 keeps the bias weak, so "Paris" means Paris, not a café near the user.
  if (near) Object.assign(params, { lat: String(near.lat), lon: String(near.lng), zoom: "4" });
  const results = await photon("/api/", params);
  // Different OSM objects can share a label (e.g. a city and its boundary).
  return results.filter((r, i) => results.findIndex((x) => x.label === r.label) === i);
}

export async function reverse(point: LatLng): Promise<string | null> {
  const [first] = await photon("/reverse", { lat: String(point.lat), lon: String(point.lng), limit: "1" });
  return first?.label ?? null;
}

async function resolve(place: PlaceInput): Promise<LatLng> {
  if ("location" in place) return place.location;
  const [first] = await photon("/api/", { q: place.address, limit: "1" });
  if (!first) throw new UserError(msg("placeNotFound", { address: place.address }), 422);
  return first.location;
}

// --- OSRM (routing) ---

export type RouteStep = { distanceMeters: number; ref: string | null; midpoint: LatLng };

export type ComputedRoute = {
  distanceMeters: number;
  durationSec: number;
  points: LatLng[];
  steps: RouteStep[];
  /** The input places as routed, in visiting order (start and end included). */
  waypoints: LatLng[];
};

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: string;
  legs?: { steps?: { distance: number; ref?: string; geometry: string }[] }[];
};
type OsrmResponse = {
  code: string;
  routes?: OsrmRoute[];
  trips?: OsrmRoute[];
  waypoints?: { location: [number, number]; waypoint_index?: number }[];
};

async function osrm(coords: LatLng[], optimize: boolean): Promise<ComputedRoute> {
  const path = coords.map((c) => `${c.lng.toFixed(6)},${c.lat.toFixed(6)}`).join(";");
  const useTrip = optimize && coords.length > 3;
  // Steps carry road refs ("A 6"), used to estimate motorway km per country.
  const params = new URLSearchParams({ overview: "full", geometries: "polyline", steps: "true" });
  if (useTrip) {
    params.set("source", "first");
    params.set("destination", "last");
    params.set("roundtrip", "false");
  }

  let data: OsrmResponse;
  try {
    data = await fetchJson<OsrmResponse>(
      "osrm",
      `${OSRM_URL}/${useTrip ? "trip" : "route"}/v1/driving/${path}?${params}`,
      { headers: HEADERS },
      15_000,
    );
  } catch (e) {
    // OSRM answers 400 with code NoRoute / NoSegment for unreachable points.
    if (e instanceof UpstreamError && e.status === 400) {
      throw new UserError(msg("routeImpossible"), 422);
    }
    throw e;
  }

  const route = (useTrip ? data.trips : data.routes)?.[0];
  if (data.code !== "Ok" || !route?.geometry || !(route.distance > 0)) {
    throw new UserError(msg("routeNotFound"), 422);
  }
  const steps: RouteStep[] = (route.legs ?? []).flatMap((leg) =>
    (leg.steps ?? [])
      .filter((s) => s.distance > 0 && s.geometry)
      .map((s) => {
        const pts = decodePolyline(s.geometry);
        return { distanceMeters: s.distance, ref: s.ref?.trim() || null, midpoint: pts[Math.floor(pts.length / 2)] };
      }),
  );
  const snapped = (data.waypoints ?? []).map((w, i) => ({
    order: useTrip ? (w.waypoint_index ?? i) : i,
    point: { lat: w.location[1], lng: w.location[0] },
  }));
  const waypoints =
    snapped.length === coords.length ? snapped.sort((a, b) => a.order - b.order).map((w) => w.point) : coords;
  return {
    distanceMeters: route.distance,
    durationSec: route.duration,
    points: decodePolyline(route.geometry),
    steps,
    waypoints,
  };
}

/**
 * Routes through all places in order. With `optimize`, intermediate stops are
 * reordered (OSRM trip service) while the first and last stay fixed.
 */
export async function computeRoute(places: PlaceInput[], optimize: boolean): Promise<ComputedRoute> {
  if (places.length < 2) throw new UserError(msg("needTwoPoints"));
  return osrm(await Promise.all(places.map(resolve)), optimize);
}

/** Fastest route through the given points, in order. */
export function routeThrough(points: LatLng[]): Promise<ComputedRoute> {
  return osrm(points, false);
}

// --- Valhalla (toll-free routing) ---

// OSRM instances cannot avoid tolls; Valhalla can (vignette motorways are
// tagged as tolls in OSM too).
const VALHALLA_URL = process.env.VALHALLA_URL || "https://valhalla1.openstreetmap.de";

type ValhallaResponse = {
  trip?: {
    summary: { length: number; time: number; has_toll?: boolean };
    legs: { shape: string }[];
  };
};

export type TollFreeRoute = { distanceMeters: number; durationSec: number; points: LatLng[]; hasToll: boolean };

/**
 * Route avoiding toll roads through `points`. Points flagged `offMotorway`
 * (border crossings) snap to the nearest non-motorway road.
 */
export async function routeAvoidingTolls(points: { point: LatLng; offMotorway: boolean }[]): Promise<TollFreeRoute> {
  const locations = points.map(({ point, offMotorway }, i) => ({
    lat: point.lat,
    lon: point.lng,
    type: i === 0 || i === points.length - 1 ? "break" : "through",
    ...(offMotorway ? { search_filter: { max_road_class: "primary" } } : {}),
  }));
  const data = await fetchJson<ValhallaResponse>(
    "valhalla",
    `${VALHALLA_URL}/route`,
    {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        locations,
        costing: "auto",
        costing_options: { auto: { use_tolls: 0 } },
        units: "kilometers",
        directions_type: "none",
      }),
    },
    30_000,
  );
  const trip = data.trip;
  if (!trip || trip.legs.length === 0) throw new UpstreamError("valhalla", null, "no route");
  return {
    distanceMeters: trip.summary.length * 1000,
    durationSec: trip.summary.time,
    points: trip.legs.flatMap((leg, i) => {
      const pts = decodePolyline(leg.shape, 6);
      return i === 0 ? pts : pts.slice(1);
    }),
    hasToll: trip.summary.has_toll === true,
  };
}

// --- Overpass (fuel stations from OpenStreetMap) ---

// Public Overpass instances, queried in parallel.
const OVERPASS_URLS = (
  process.env.OVERPASS_URLS ||
  "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter"
)
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

export type OsmStation = { id: string; name: string; address: string; location: LatLng };

export type OverpassResponse = {
  elements?: {
    type: "node" | "way" | "relation";
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
  }[];
};

/** Runs an Overpass query on all instances at once; the first answer wins. */
export async function overpass(query: string, timeoutMs: number): Promise<OverpassResponse> {
  const body = new URLSearchParams({ data: query }).toString();
  try {
    return await Promise.any(
      OVERPASS_URLS.map((url) =>
        fetchJson<OverpassResponse>(
          "overpass",
          url,
          { method: "POST", headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" }, body },
          timeoutMs,
        ),
      ),
    );
  } catch (e) {
    const reasons = e instanceof AggregateError ? e.errors.map((x) => (x instanceof Error ? x.message : String(x))) : [];
    throw new UpstreamError("overpass", null, `all instances failed (${reasons.join("; ")})`);
  }
}

/** Bounding box [south, west, north, east] of a country (European part), from the offline border data. */
export function countryBbox(country: string): [number, number, number, number] | null {
  let s = 90, w = 180, n = -90, e = -180;
  const visit = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [lng, lat] = c as [number, number];
      // Europe only (e.g. leaves out overseas territories).
      if (lat < 34 || lat > 72 || lng < -25 || lng > 45) return;
      s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lng); e = Math.max(e, lng);
    } else if (Array.isArray(c)) c.forEach(visit);
  };
  // Some countries (NL, DK, FI) are aggregates whose parts carry the geometry.
  const collect = (id: string, depth: number): void => {
    const f = feature(id);
    if (!f || depth > 3) return;
    if (f.geometry) visit((f.geometry as { coordinates: unknown }).coordinates);
    for (const m of (f.properties as { members?: string[] }).members ?? []) collect(m, depth + 1);
  };
  collect(country, 0);
  return s <= n ? [s, w, n, e] : null;
}

const TILE_DEG = 0.5;

/** Tiles (s, w, n, e) covering a country, leaving out tiles that show no part of it. */
export function countryTiles(country: string): [number, number, number, number][] {
  const box = countryBbox(country);
  if (!box) return [];
  const [s0, w0, n0, e0] = box;
  const tiles: [number, number, number, number][] = [];
  for (let s = Math.floor(s0 / TILE_DEG) * TILE_DEG; s < n0; s += TILE_DEG) {
    for (let w = Math.floor(w0 / TILE_DEG) * TILE_DEG; w < e0; w += TILE_DEG) {
      const n = s + TILE_DEG, e = w + TILE_DEG;
      let hit = false;
      for (let i = 0; i <= 4 && !hit; i++) {
        for (let j = 0; j <= 4 && !hit; j++) {
          hit = countryAt({ lat: s + (TILE_DEG * i) / 4, lng: w + (TILE_DEG * j) / 4 }) === country;
        }
      }
      // Tiny countries (Liechtenstein, Monaco) can slip between the sample points.
      const tiny = (n0 - s0) * (e0 - w0) < 0.25 && s < n0 && n > s0 && w < e0 && e > w0;
      if (hit || tiny) tiles.push([s, w, n, e]);
    }
  }
  return tiles;
}

/** All car fuel stations of a country, tile by tile; null when a tile kept failing. */
export async function countryStations(country: string, log: (line: string) => void): Promise<OsmStation[] | null> {
  const tiles = countryTiles(country);
  const found = new Map<string, OsmStation>();
  for (const [s, w, n, e] of tiles) {
    const query = `[out:json][timeout:60];nwr[amenity=fuel](${s.toFixed(2)},${w.toFixed(2)},${n.toFixed(2)},${e.toFixed(2)});out center tags;`;
    let ok = false;
    for (let attempt = 0; attempt < 5 && !ok; attempt++) {
      try {
        for (const st of parseStations(await overpass(query, 75_000))) {
          if (countryAt(st.location) === country) found.set(st.id, st);
        }
        ok = true;
      } catch (err) {
        log(`tile ${s},${w} attempt ${attempt + 1}: ${err instanceof Error ? err.message : err}`);
        await new Promise((r) => setTimeout(r, 15_000 * 2 ** attempt));
      }
    }
    if (!ok) return null;
    // Be polite to the public instances.
    await new Promise((r) => setTimeout(r, 1_500));
  }
  return [...found.values()];
}

/** Car fuel stations from an Overpass answer. */
export function parseStations(data: OverpassResponse): OsmStation[] {
  const stations: OsmStation[] = [];
  for (const el of data.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined || el.type === "relation") continue;
    const tags = el.tags ?? {};
    // Skip stations that sell no fuel for cars (e.g. LPG- or truck-only) when tagged so.
    if (tags["fuel:diesel"] === "no" && tags["fuel:octane_95"] === "no") continue;
    const name = tags.brand || tags.name || tags.operator || "⛽";
    const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
    const address = [street, tags["addr:city"]].filter(Boolean).join(", ");
    stations.push({ id: `osm:${el.type}/${el.id}`, name, address, location: { lat, lng } });
  }
  return stations;
}

const stationCache = new Map<string, { at: number; stations: OsmStation[] }>();
const STATION_CACHE_MS = 24 * 3600_000;

/** Fuel stations (amenity=fuel) around a point, live from Overpass; cached for a day per ~1 km cell. */
export async function fuelStationsNear(point: LatLng, radiusKm: number): Promise<OsmStation[]> {
  const key = `${point.lat.toFixed(2)},${point.lng.toFixed(2)},${radiusKm}`;
  const hit = stationCache.get(key);
  if (hit && Date.now() - hit.at < STATION_CACHE_MS) return hit.stations;
  // Tag filter first: "nwr(around)[amenity=fuel]" scans everything nearby and times out.
  const query = `[out:json][timeout:20];nwr[amenity=fuel](around:${Math.round(radiusKm * 1000)},${point.lat.toFixed(5)},${point.lng.toFixed(5)});out center tags 40;`;
  const stations = parseStations(await overpass(query, 25_000));
  if (stationCache.size > 5_000) stationCache.clear();
  stationCache.set(key, { at: Date.now(), stations });
  return stations;
}
