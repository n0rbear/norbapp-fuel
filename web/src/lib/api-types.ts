import type { LatLng } from "./geo";
import type { AppMessage } from "../i18n/message";
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

/** Display label of a Euro emission class; `t` translates the two worded ones. */
export function euroClassLabel(c: EuroClass, t: (key: "euroElectric" | "euroUnknown") => string): string {
  if (c === "electric") return t("euroElectric");
  if (c === "0") return t("euroUnknown");
  return `Euro ${c}`;
}

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
  /** Countries where toll roads (incl. vignette roads) should be avoided. */
  avoidTollCountries: string[];
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
  | { mode: "official"; source: string; stations: Station[]; estimate: null; e5InsteadOfE10: boolean }
  | {
      mode: "estimate";
      source: string;
      stations: [];
      estimate: { price: number; low: number; high: number; location: "highway" | "city" };
      /** E10 was asked for but only an E5 (Super 95) price exists here. */
      e5InsteadOfE10: boolean;
    }
  /** Outside the EU, or the price service failed. */
  | { mode: "none"; source: null; stations: []; estimate: null; e5InsteadOfE10: false; reason: AppMessage };

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
  /** Countries needing a toll estimate (EU, not driven toll-free), subset of `countries`. */
  tollCountries: string[];
  /** Countries where the route avoids toll roads. */
  avoidedTollCountries: string[];
  /** Approximate motorway km per country (from road refs), for distance-based tolls. */
  motorwayKm: Record<string, number>;
  points: FuelPoint[];
  /** Simplified route geometry for display. */
  path: LatLng[];
  warnings: AppMessage[];
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
        lines: {
          kind: "vignette" | "distance" | "other";
          /** Vignette product id from the FUEL-API (e.g. "10d", "1y"). */
          id: string | null;
          km: number | null;
          label: string;
          price: number;
        }[];
      }[];
    }
  | { status: "euro_class_required" };

export type ApiError = { error: AppMessage };
