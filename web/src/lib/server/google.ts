import "server-only";
import type { PlaceInput } from "../api-types";
import type { LatLng } from "../geo";
import { googleApiKey, UserError } from "./env";
import { fetchJson, UpstreamError } from "./http";

type Waypoint = { address: string } | { location: { latLng: { latitude: number; longitude: number } } };

function toWaypoint(place: PlaceInput | string): Waypoint {
  if (typeof place === "string") return { address: place };
  if ("address" in place) return { address: place.address };
  return { location: { latLng: { latitude: place.location.lat, longitude: place.location.lng } } };
}

export type ComputedRoute = {
  distanceMeters: number;
  durationSec: number;
  encodedPolyline: string;
};

type RoutesResponse = {
  routes?: {
    distanceMeters?: number;
    duration?: string;
    polyline?: { encodedPolyline?: string };
  }[];
};

/** Routes API (computeRoutes). Stops are visited in the given order unless `optimize` is set. */
export async function computeRoute(
  origin: PlaceInput,
  destination: PlaceInput | string,
  intermediates: (PlaceInput | string)[],
  optimize: boolean,
): Promise<ComputedRoute> {
  let data: RoutesResponse;
  try {
    data = await fetchJson<RoutesResponse>("routes", "https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleApiKey(),
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: toWaypoint(origin),
        destination: toWaypoint(destination),
        intermediates: intermediates.map(toWaypoint),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        optimizeWaypointOrder: optimize && intermediates.length > 1,
        languageCode: "hu",
        units: "METRIC",
      }),
    });
  } catch (e) {
    // Routes API answers 400 for unresolvable addresses.
    if (e instanceof UpstreamError && e.status === 400) {
      throw new UserError("Az útvonal nem tervezhető – ellenőrizd a címeket.");
    }
    throw e;
  }

  const route = data.routes?.[0];
  if (!route?.polyline?.encodedPolyline || !route.distanceMeters) {
    throw new UserError("Nem található útvonal a megadott pontok között.", 422);
  }
  return {
    distanceMeters: route.distanceMeters,
    durationSec: Number.parseInt(route.duration ?? "0", 10) || 0,
    encodedPolyline: route.polyline.encodedPolyline,
  };
}

type AutocompleteResponse = {
  suggestions?: { placePrediction?: { text?: { text?: string } } }[];
};

export async function autocomplete(input: string, sessionToken?: string): Promise<string[]> {
  const data = await fetchJson<AutocompleteResponse>(
    "places",
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleApiKey(),
        "X-Goog-FieldMask": "suggestions.placePrediction.text.text",
      },
      body: JSON.stringify({ input, languageCode: "hu", sessionToken }),
    },
    5_000,
  );
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction?.text?.text)
    .filter((t): t is string => !!t)
    .slice(0, 6);
}

type GeocodeResponse = {
  status: string;
  results?: {
    formatted_address?: string;
    address_components?: { short_name: string; types: string[] }[];
  }[];
};

const countryCache = new Map<string, string | null>();
const COUNTRY_CACHE_LIMIT = 5_000;

/** ISO country code at a coordinate, or null over water / unknown. Cached on a ~1 km grid. */
export async function countryAt(point: LatLng): Promise<string | null> {
  const cacheKey = `${point.lat.toFixed(2)},${point.lng.toFixed(2)}`;
  if (countryCache.has(cacheKey)) return countryCache.get(cacheKey)!;

  const params = new URLSearchParams({
    latlng: `${point.lat},${point.lng}`,
    result_type: "country",
    key: googleApiKey(),
  });
  const data = await fetchJson<GeocodeResponse>(
    "geocoding",
    `https://maps.googleapis.com/maps/api/geocode/json?${params}`,
    {},
    5_000,
  );
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new UpstreamError("geocoding", null, data.status);
  }
  const code =
    data.results?.[0]?.address_components?.find((c) => c.types.includes("country"))?.short_name ?? null;

  if (countryCache.size >= COUNTRY_CACHE_LIMIT) countryCache.clear();
  countryCache.set(cacheKey, code);
  return code;
}

export async function addressAt(point: LatLng): Promise<string | null> {
  const params = new URLSearchParams({
    latlng: `${point.lat},${point.lng}`,
    language: "hu",
    key: googleApiKey(),
  });
  const data = await fetchJson<GeocodeResponse>(
    "geocoding",
    `https://maps.googleapis.com/maps/api/geocode/json?${params}`,
    {},
    5_000,
  );
  return data.results?.[0]?.formatted_address ?? null;
}
