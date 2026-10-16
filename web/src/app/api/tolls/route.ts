import { estimateTolls } from "@/lib/server/fuel-api";
import { clientKey, RateLimiter } from "@/lib/server/rate-limit";
import { handleError, jsonError } from "@/lib/server/respond";
import { parseTollsQuery } from "@/lib/validate";

const limiter = new RateLimiter(30, 30);

export async function GET(request: Request) {
  const parsed = parseTollsQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  if (!limiter.take(clientKey(request))) return jsonError("Túl sok kérés.", 429);

  try {
    return Response.json(await estimateTolls(parsed.value), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handleError("tolls", e);
  }
}
