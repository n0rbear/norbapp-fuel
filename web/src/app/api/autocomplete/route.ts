import { autocomplete } from "@/lib/server/osm";
import { clientKey, RateLimiter } from "@/lib/server/rate-limit";
import { handleError, jsonError } from "@/lib/server/respond";

const limiter = new RateLimiter(60, 60);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const near =
    searchParams.has("lat") && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng }
      : undefined;

  if (q.length < 3 || q.length > 200) return Response.json({ suggestions: [] });
  if (!limiter.take(clientKey(request))) return jsonError("tooManyRequests", 429);

  try {
    return Response.json({ suggestions: await autocomplete(q, near) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handleError("autocomplete", e);
  }
}
