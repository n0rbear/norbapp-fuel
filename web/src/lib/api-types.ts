import type { LatLng } from "./geo";
import type { FuelType, RefuelPlan, Vehicle } from "./trip";

/** Free text (geocoded on the server) or a location picked from suggestions. */
export type PlaceInput = { address: string } | { location: LatLng; label?: string };

export type PlaceSuggestion = { label: string; location: LatLng };

/** EU currencies supported by the FUEL-API. */
export const CURRENCIES = ["EUR", "CZK", "DKK", "HUF", "PLN", "RON", "SEK"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type CurrencyInfo = { code: Currency; name: string; rate: number };

export const EURO_CLASSES = ["electric", "6", "5", "4", "3", "2", "1", "0"] as const;
export type EuroClass = (typeof EURO_CLASSES)[number];

export const EURO_CLASS_LABELS: Record<EuroClass, string> = {
  electric: "Elektromos",
  "6": "Euro 6",
  "5": "Euro 5",
  "4": "Euro 4",
  "3": "Euro 3",
  "2": "Euro 2",
  "1": "Euro 1",
  "0": "Euro 0 / ismeretlen",
};

export type PlanRequest = {
  origin: PlaceInput;
  destination: PlaceInput;
  waypoints: PlaceInput[];
  roundTrip: boolean;
  optimizeWaypoints: boolean;
  fuelType: FuelType;
  currency: Currency;
  vehicle: Vehicle;
  /** Fill the tank up before departure (only matters below 100%). */
  fillAtStart: boolean;
};

export type Station = {
  id: string;
  name: string;
  address: string;
  /** km from the search point */
  distanceKm: number | null;
  /** In the request currency, per litre. */
  price: number | null;
  isOpen: boolean | null;
};

export type PointPrices =
  | { mode: "official"; source: string; stations: Station[]; estimate: null; fuelNote: string | null }
  | {
      mode: "estimate";
      source: string;
      stations: [];
      estimate: { price: number; low: number; high: number; location: "highway" | "city" };
      /** Set when E10 was asked for but only an E5 (Super 95) price exists here. */
      fuelNote: string | null;
    }
  /** Outside the EU, or the price service failed. */
  | { mode: "none"; source: null; stations: []; estimate: null; fuelNote: null; reason: string };

export type FuelPoint = {
  kind: "start" | "stop";
  km: number;
  location: LatLng;
  country: string | null;
  prices: PointPrices;
};

export type PlanResponse = {
  distanceKm: number;
  durationSec: number;
  plan: RefuelPlan;
  currency: Currency;
  /** EUR → currency rate used for the prices (1 for EUR). */
  rate: number | null;
  /** Countries crossed, in route order. */
  countries: string[];
  /** Countries the FUEL-API covers (EU), subset of `countries`. */
  tollCountries: string[];
  /** Approximate motorway km per country (from road refs), for distance-based tolls. */
  motorwayKm: Record<string, number>;
  points: FuelPoint[];
  /** Simplified route geometry for display. */
  path: LatLng[];
  warnings: string[];
};

export type TollEstimate =
  | {
      status: "ok";
      asOf: string;
      total: number;
      countries: {
        country: string;
        system: "vignette" | "distance" | "free";
        subtotal: number;
        lines: { label: string; price: number }[];
      }[];
    }
  | { status: "euro_class_required" };

export type ApiError = { error: string };
