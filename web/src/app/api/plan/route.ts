import { buildPlan } from "@/lib/server/plan";
import { clientKey, RateLimiter } from "@/lib/server/rate-limit";
import { handleError, jsonError } from "@/lib/server/respond";
import { parsePlanRequest } from "@/lib/validate";

const limiter = new RateLimiter(10, 10);

export async function POST(request: Request) {
  if (!limiter.take(clientKey(request))) {
    return jsonError("Túl sok kérés, várj egy percet.", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Hibás kérés.", 400);
  }

  const parsed = parsePlanRequest(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  try {
    const plan = await buildPlan(parsed.value);
    return Response.json(plan, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handleError("plan", e);
  }
}
