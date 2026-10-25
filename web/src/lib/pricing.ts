import type { FuelPoint } from "./api-types";
import type { PricedPoint } from "./trip";

export type PriceOptions = {
  /** Overrides every price when set. */
  manualPrice: number | null;
  /** Used where no price data is available. */
  defaultPrice: number;
  /** Selected station id per fuel point index. */
  selected: Record<number, string | undefined>;
  /**
   * Stations with user-reported / learned prices per fuel point index
   * (average-price countries only; loaded after the plan).
   */
  community?: Record<number, { id: string; price: number; priceKind: "confirmed" | "learned" | "estimate" }[] | undefined>;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Picks the price for each fuel point.
 * Stops: manual > selected station > cheapest station > estimate > default.
 * Start (the fuel already in the tank, bought earlier): manual > local median
 * station price > estimate > default – it is not a fill-up, so no station is picked.
 */
export function resolvePrices(points: FuelPoint[], options: PriceOptions): PricedPoint[] {
  return points.map((point, i) => {
    if (options.manualPrice !== null) return { price: options.manualPrice, source: "manual" };

    const { stations, estimate } = point.prices;
    if (point.kind === "start") {
      const prices = stations.map((s) => s.price).filter((p): p is number => p !== null);
      if (prices.length > 0) return { price: median(prices), source: "average" };
      if (estimate) return { price: estimate.price, source: "estimate" };
      return { price: options.defaultPrice, source: "default" };
    }

    const selected = stations.find((s) => s.id === options.selected[i]);
    if (selected?.price != null) return { price: selected.price, source: "station" };

    const community = options.community?.[i] ?? [];
    const chosen = community.find((s) => s.id === options.selected[i]);
    if (chosen) return { price: chosen.price, source: "station" };
    // Where users confirmed prices around the stop, their (learned) prices beat the plain average.
    if (community.some((s) => s.priceKind !== "estimate")) {
      return { price: median(community.map((s) => s.price)), source: "community" };
    }

    const cheapest = stations.find((s) => s.price != null);
    if (cheapest?.price != null) return { price: cheapest.price, source: "cheapest" };

    if (estimate) return { price: estimate.price, source: "estimate" };

    return { price: options.defaultPrice, source: "default" };
  });
}

/** Parses a user-typed decimal ("1,72" or "1.72"); null when blank or invalid. */
export function parseDecimal(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (normalized === "" || !/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}
