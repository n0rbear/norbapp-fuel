export type FuelType = "diesel" | "petrol";

export const FUEL_TYPES: { id: FuelType; label: string }[] = [
  { id: "diesel", label: "Dízel" },
  { id: "petrol", label: "Benzin (95)" },
];

export type Vehicle = {
  /** l/100 km */
  consumption: number;
  /** litres */
  tankSize: number;
  /** 0–100, fuel level at departure */
  startLevelPct: number;
  /** 0–100, never plan to drop below this level */
  reservePct: number;
};

export const DEFAULT_VEHICLE: Vehicle = {
  consumption: 7.2,
  tankSize: 50,
  startLevelPct: 100,
  reservePct: 20,
};

export type RefuelStop = {
  /** Distance from the start where the stop happens. */
  km: number;
  /** Litres needed to fill the tank at this stop. */
  litres: number;
};

export type RefuelPlan = {
  totalKm: number;
  totalLitres: number;
  startLitres: number;
  stops: RefuelStop[];
};

export function validateVehicle(v: Vehicle): string | null {
  if (!(v.consumption > 0 && v.consumption <= 100)) return "A fogyasztás 0 és 100 l/100 km között legyen.";
  if (!(v.tankSize >= 5 && v.tankSize <= 500)) return "A tankméret 5 és 500 liter között legyen.";
  if (!(v.startLevelPct > 0 && v.startLevelPct <= 100)) return "Az indulási tankszint 1 és 100% között legyen.";
  if (!(v.reservePct >= 0 && v.reservePct < 90)) return "A tartalék 0 és 90% között legyen.";
  return null;
}

/**
 * Plans refuel stops: drive until the tank reaches the reserve level, then fill
 * up — unless the remaining distance can be covered without dipping below it.
 */
export function planRefuels(totalKm: number, vehicle: Vehicle): RefuelPlan {
  const error = validateVehicle(vehicle);
  if (error) throw new Error(error);
  if (!(totalKm >= 0)) throw new Error("Invalid distance");

  const perKm = vehicle.consumption / 100;
  const reserve = (vehicle.tankSize * vehicle.reservePct) / 100;
  const startLitres = (vehicle.tankSize * vehicle.startLevelPct) / 100;
  const stops: RefuelStop[] = [];

  let position = 0;
  let fuel = startLitres;
  const epsilon = 1e-9;

  while (true) {
    const remainingKm = totalKm - position;
    if (fuel - remainingKm * perKm >= reserve - epsilon) break;

    const reachableKm = Math.max(0, (fuel - reserve) / perKm);
    position += reachableKm;
    fuel -= reachableKm * perKm;
    stops.push({ km: position, litres: vehicle.tankSize - fuel });
    fuel = vehicle.tankSize;

    if (stops.length > 1000) throw new Error("Too many refuel stops");
  }

  return { totalKm, totalLitres: totalKm * perKm, startLitres, stops };
}

export type PriceSource = "manual" | "station" | "cheapest" | "estimate" | "default";

export type PricedPoint = { price: number; source: PriceSource };

export type CostBreakdown = {
  /** Cost of the fuel actually burned on the trip. */
  fuelCost: number;
  /** Money paid at the pumps during the trip (stops only). */
  paidAtStops: number;
  segments: { fromKm: number; toKm: number; litres: number; price: number; source: PriceSource }[];
  stops: (RefuelStop & PricedPoint & { cost: number })[];
};

/**
 * Prices the fuel burned on the trip. Fuel burned before the first stop is
 * priced at the start price; after each stop, at that stop's price.
 * `prices[0]` is the start, `prices[i + 1]` belongs to `plan.stops[i]`.
 */
export function computeFuelCost(plan: RefuelPlan, consumption: number, prices: PricedPoint[]): CostBreakdown {
  if (prices.length !== plan.stops.length + 1) throw new Error("Price count must be stops + 1");
  const perKm = consumption / 100;
  const boundaries = [0, ...plan.stops.map((s) => s.km), plan.totalKm];

  const segments = prices.map((p, i) => {
    const fromKm = boundaries[i];
    const toKm = boundaries[i + 1];
    const litres = (toKm - fromKm) * perKm;
    return { fromKm, toKm, litres, price: p.price, source: p.source };
  });

  const stops = plan.stops.map((s, i) => ({ ...s, ...prices[i + 1], cost: s.litres * prices[i + 1].price }));

  return {
    fuelCost: segments.reduce((sum, s) => sum + s.litres * s.price, 0),
    paidAtStops: stops.reduce((sum, s) => sum + s.cost, 0),
    segments,
    stops,
  };
}
