import "server-only";
import { iso1A2Code } from "@rapideditor/country-coder";
import type { PlaceInput, PlaceSuggestion } from "../api-types";
import { decodePolyline, type LatLng } from "../geo";
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
  if (!first) throw new UserError(`Nem található: „${place.address}”. Válassz a javaslatok közül.`, 422);
  return first.location;
}

// --- OSRM (routing) ---

export type RouteStep = { distanceMeters: number; ref: string | null; midpoint: LatLng };

export type ComputedRoute = {
  distanceMeters: number;
  durationSec: number;
  encodedPolyline: string;
  steps: RouteStep[];
};

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: string;
  legs?: { steps?: { distance: number; ref?: string; geometry: string }[] }[];
};
type OsrmResponse = { code: string; routes?: OsrmRoute[]; trips?: OsrmRoute[] };

/**
 * Routes through all places in order. With `optimize`, intermediate stops are
 * reordered (OSRM trip service) while the first and last stay fixed.
 */
export async function computeRoute(places: PlaceInput[], optimize: boolean): Promise<ComputedRoute> {
  if (places.length < 2) throw new UserError("Legalább két pont szükséges.");
  const coords = await Promise.all(places.map(resolve));
  const path = coords.map((c) => `${c.lng.toFixed(6)},${c.lat.toFixed(6)}`).join(";");
  const useTrip = optimize && places.length > 3;
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
      throw new UserError("Az útvonal nem tervezhető a megadott pontok között.", 422);
    }
    throw e;
  }

  const route = (useTrip ? data.trips : data.routes)?.[0];
  if (data.code !== "Ok" || !route?.geometry || !(route.distance > 0)) {
    throw new UserError("Nem található útvonal a megadott pontok között.", 422);
  }
  const steps: RouteStep[] = (route.legs ?? []).flatMap((leg) =>
    (leg.steps ?? [])
      .filter((s) => s.distance > 0 && s.geometry)
      .map((s) => {
        const pts = decodePolyline(s.geometry);
        return { distanceMeters: s.distance, ref: s.ref?.trim() || null, midpoint: pts[Math.floor(pts.length / 2)] };
      }),
  );
  return { distanceMeters: route.distance, durationSec: route.duration, encodedPolyline: route.geometry, steps };
}
