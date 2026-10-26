import { track } from "@/lib/server/analytics";
import { buildPlan } from "@/lib/server/plan";
import { clientKey, RateLimiter } from "@/lib/server/rate-limit";
import { handleError, jsonError } from "@/lib/server/respond";
import { parsePlanRequest } from "@/lib/validate";

const limiter = new RateLimiter(10, 10);

export async function POST(request: Request) {
  if (!limiter.take(clientKey(request))) {
    return jsonError("tooManyRequests", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalidRequest", 400);
  }

  const parsed = parsePlanRequest(body);
  if (!parsed.ok) {
    track(request, "plan_error", { code: parsed.error.code });
    return jsonError(parsed.error, 400);
  }

  try {
    const started = Date.now();
    const plan = await buildPlan(parsed.value);
    const req = parsed.value;
    track(request, "plan", {
      from: plan.countries[0] ?? null,
      to: plan.countries[plan.countries.length - 1] ?? null,
      countries: plan.countries,
      km: Math.round(plan.distanceKm),
      fuel: req.fuelType,
      currency: req.currency,
      waypoints: req.waypoints.length,
      roundTrip: req.roundTrip,
      optimize: req.optimizeWaypoints,
      fillAtStart: req.fillAtStart,
      avoid: req.avoidTollCountries,
      stops: plan.plan.stops.length,
      priceModes: plan.points.map((p) => p.prices.mode),
      warnings: plan.warnings.map((w) => w.code),
      ms: Date.now() - started,
    });
    return Response.json(plan, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const response = handleError("plan", e);
    response
      .clone()
      .json()
      .then((b: { error?: { code?: string } }) => track(request, "plan_error", { code: b.error?.code ?? "unknown" }))
      .catch(() => {});
    return response;
  }
}
