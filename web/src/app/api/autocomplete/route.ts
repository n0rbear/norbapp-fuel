import { autocomplete } from "@/lib/server/google";
import { clientKey, RateLimiter } from "@/lib/server/rate-limit";
import { handleError, jsonError } from "@/lib/server/respond";

const limiter = new RateLimiter(60, 60);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const session = searchParams.get("session") ?? undefined;

  if (q.length < 3 || q.length > 200) return Response.json({ suggestions: [] });
  if (session && !/^[A-Za-z0-9-]{1,64}$/.test(session)) return jsonError("Hibás kérés.", 400);
  if (!limiter.take(clientKey(request))) return jsonError("Túl sok kérés.", 429);

  try {
    return Response.json({ suggestions: await autocomplete(q, session) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handleError("autocomplete", e);
  }
}
