import { reverse } from "@/lib/server/osm";
import { clientKey, RateLimiter } from "@/lib/server/rate-limit";
import { handleError, jsonError } from "@/lib/server/respond";

const limiter = new RateLimiter(10, 10);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return jsonError("invalidCoordinate", 400);
  }
  if (!limiter.take(clientKey(request))) return jsonError("tooManyRequests", 429);

  try {
    return Response.json({ address: await reverse({ lat, lng }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handleError("reverse", e);
  }
}
