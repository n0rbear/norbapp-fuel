import type { LatLng } from "./geo";
import type { FuelType, RefuelPlan, Vehicle } from "./trip";

/** Free text (geocoded on the server) or a location picked from suggestions. */
export type PlaceInput = { address: string } | { location: LatLng; label?: string };

export type PlaceSuggestion = { label: string; location: LatLng };

export type PlanRequest = {
  origin: PlaceInput;
  destination: PlaceInput;
  waypoints: PlaceInput[];
  roundTrip: boolean;
  optimizeWaypoints: boolean;
  fuelType: FuelType;
  vehicle: Vehicle;
};

export type Station = {
  id: string;
  name: string;
  address: string;
  /** km from the search point */
  distanceKm: number | null;
  price: number | null;
  isOpen: boolean | null;
};

export type StationProvider = "tankerkoenig" | "e-control";

export type FuelPoint = {
  kind: "start" | "stop";
  km: number;
  location: LatLng;
  country: string | null;
  provider: StationProvider | null;
  stations: Station[];
  /** Set when the provider failed; stations is then empty. */
  stationsError: string | null;
};

export type PlanResponse = {
  distanceKm: number;
  durationSec: number;
  plan: RefuelPlan;
  /** Countries crossed, in route order. */
  countries: string[];
  points: FuelPoint[];
  /** Simplified route geometry for display. */
  path: LatLng[];
  warnings: string[];
};

export type ApiError = { error: string };
