import type { FuelPoint } from "./api-types";
import type { PricedPoint } from "./trip";

export type PriceOptions = {
  /** Overrides every price when set. */
  manualPrice: number | null;
  /** Used where no price data is available. */
  defaultPrice: number;
  /** Selected station id per fuel point index. */
  selected: Record<number, string | undefined>;
};

/** Picks the price for each fuel point: manual > selected station > cheapest station > estimate > default. */
export function resolvePrices(points: FuelPoint[], options: PriceOptions): PricedPoint[] {
  return points.map((point, i) => {
    if (options.manualPrice !== null) return { price: options.manualPrice, source: "manual" };

    const { stations, estimate } = point.prices;
    const selected = stations.find((s) => s.id === options.selected[i]);
    if (selected?.price != null) return { price: selected.price, source: "station" };

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
