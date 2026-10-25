import { CURRENCIES, type Currency } from "@/lib/api-types";
import { addReport, communityEnabled, hashIp } from "@/lib/server/community-db";
import { baselineEur, estimateCountries, eurRate } from "@/lib/server/fuel-api";
import { clientKey, RateLimiter } from "@/lib/server/rate-limit";
import { handleError, jsonError } from "@/lib/server/respond";
import { FUEL_TYPES, type FuelType } from "@/lib/trip";

// Generous for honest use (a few stations per trip), tight for flooding.
const limiter = new RateLimiter(10, 2);

export async function POST(request: Request) {
  const ip = clientKey(request);
  if (!limiter.take(ip)) return jsonError("tooManyRequests", 429);
  if (!communityEnabled) return jsonError("serviceMisconfigured", 503);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("invalidRequest", 400);
  }
  const stationId = String(body.stationId ?? "");
  const country = String(body.country ?? "");
  const fuel = body.fuel as FuelType;
  const currency = body.currency as Currency;
  const deviceId = String(body.deviceId ?? "");
  const where = body.where === "highway" ? "highway" : "city";
  const price = Number(body.price);
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (
    !/^osm:(node|way)\/\d{1,15}$/.test(stationId) ||
    !/^[A-Z]{2}$/.test(country) ||
    !FUEL_TYPES.some((f) => f.id === fuel) ||
    !CURRENCIES.includes(currency) ||
    !/^[0-9a-f-]{16,64}$/i.test(deviceId) ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return jsonError("invalidRequest", 400);
  }

  try {
    if (!(await estimateCountries()).has(country)) return jsonError("invalidRequest", 400);
    const [baseline, rate] = await Promise.all([baselineEur(country, fuel, where), eurRate(currency)]);
    if (baseline === null) return jsonError("upstreamUnavailable", 503);
    const status = await addReport({
      stationId,
      fuel,
      country,
      priceEur: price / rate,
      baselineEur: baseline,
      location: { lat, lng },
      deviceId: deviceId.toLowerCase(),
      ipHash: hashIp(ip),
    });
    return Response.json({ status }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handleError("community-report", e);
  }
}
