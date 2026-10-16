import type { PlaceInput, PlanRequest } from "./api-types";
import { FUEL_TYPES, validateVehicle, type FuelType } from "./trip";

export const MAX_WAYPOINTS = 10;
const MAX_ADDRESS_LENGTH = 200;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function address(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_ADDRESS_LENGTH ? trimmed : null;
}

function finite(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function place(v: unknown): PlaceInput | null {
  if (!isObject(v)) return null;
  if ("address" in v) {
    const a = address(v.address);
    return a ? { address: a } : null;
  }
  if (isObject(v.location)) {
    const lat = finite(v.location.lat);
    const lng = finite(v.location.lng);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { location: { lat, lng } };
  }
  return null;
}

/** Validates an untrusted JSON body. Blank waypoints are dropped rather than rejected. */
export function parsePlanRequest(body: unknown): Result<PlanRequest> {
  if (!isObject(body)) return { ok: false, error: "Hibás kérés." };

  const origin = place(body.origin);
  if (!origin) return { ok: false, error: "Add meg az indulási helyet." };

  const destination = address(body.destination);
  if (!destination) return { ok: false, error: "Add meg az úti célt." };

  if (body.waypoints !== undefined && !Array.isArray(body.waypoints)) return { ok: false, error: "Hibás megállólista." };
  const rawWaypoints = (body.waypoints as unknown[] | undefined) ?? [];
  if (rawWaypoints.some((w) => typeof w !== "string")) return { ok: false, error: "Hibás megállólista." };
  const waypoints = (rawWaypoints as string[]).map((w) => w.trim()).filter((w) => w.length > 0);
  if (waypoints.length > MAX_WAYPOINTS) return { ok: false, error: `Legfeljebb ${MAX_WAYPOINTS} megálló adható meg.` };
  if (waypoints.some((w) => w.length > MAX_ADDRESS_LENGTH)) return { ok: false, error: "Túl hosszú cím." };

  const fuelType = body.fuelType as FuelType;
  if (!FUEL_TYPES.some((f) => f.id === fuelType)) return { ok: false, error: "Ismeretlen üzemanyagtípus." };

  if (!isObject(body.vehicle)) return { ok: false, error: "Hiányzó járműadatok." };
  const vehicle = {
    consumption: finite(body.vehicle.consumption) ?? NaN,
    tankSize: finite(body.vehicle.tankSize) ?? NaN,
    startLevelPct: finite(body.vehicle.startLevelPct) ?? NaN,
    reservePct: finite(body.vehicle.reservePct) ?? NaN,
  };
  const vehicleError = validateVehicle(vehicle);
  if (vehicleError) return { ok: false, error: vehicleError };

  return {
    ok: true,
    value: {
      origin,
      destination,
      waypoints,
      roundTrip: body.roundTrip === true,
      optimizeWaypoints: body.optimizeWaypoints === true,
      fuelType,
      vehicle,
    },
  };
}
