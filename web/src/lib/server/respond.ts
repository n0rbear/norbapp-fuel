import "server-only";
import { ConfigError, UserError } from "./env";
import { UpstreamError } from "./http";

export function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Maps thrown errors to a safe response; internal details only go to the server log. */
export function handleError(scope: string, e: unknown): Response {
  if (e instanceof UserError) return jsonError(e.message, e.status);
  if (e instanceof ConfigError) {
    console.error(`[${scope}] configuration error: ${e.message}`);
    return jsonError("A szolgáltatás nincs megfelelően beállítva.", 503);
  }
  if (e instanceof UpstreamError) {
    console.error(`[${scope}] upstream ${e.service} failed: status=${e.status ?? "-"} ${e.message}`);
    return jsonError("Egy külső szolgáltatás nem válaszolt, próbáld újra később.", 502);
  }
  console.error(`[${scope}] unexpected error`, e instanceof Error ? e.message : e);
  return jsonError("Váratlan hiba történt.", 500);
}
