import { CURRENCIES, type Currency } from "@/lib/api-types";
import { track } from "@/lib/server/analytics";
import { communityStations } from "@/lib/server/community";
import { estimateCountries } from "@/lib/server/fuel-api";
import { clientKey, RateLimiter } from "@/lib/server/rate-limit";
import { handleError, jsonError } from "@/lib/server/respond";
import { FUEL_TYPES, type FuelType } from "@/lib/trip";

const limiter = new RateLimiter(30, 30);

export async function GET(request: Request) {
  if (!limiter.take(clientKey(request))) return jsonError("tooManyRequests", 429);
  const q = new URL(request.url).searchParams;
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  const country = q.get("country") ?? "";
  const fuel = q.get("fuel") as FuelType;
  const currency = q.get("currency") as Currency;
  const where = q.get("where") === "highway" ? "highway" : "city";
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return jsonError("invalidCoordinate", 400);
  if (!/^[A-Z]{2}$/.test(country) || !FUEL_TYPES.some((f) => f.id === fuel) || !CURRENCIES.includes(currency)) {
    return jsonError("invalidRequest", 400);
  }
  try {
    if (!(await estimateCountries()).has(country)) {
      return Response.json({ stations: [], reportable: false }, { headers: { "Cache-Control": "no-store" } });
    }
    const started = Date.now();
    const result = await communityStations(country, { lat, lng }, fuel, currency, where);
    track(request, "stations", {
      country,
      found: result.stations.length,
      confirmed: result.stations.filter((st) => st.priceKind !== "estimate").length,
      ms: Date.now() - started,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handleError("community-stations", e);
  }
}
