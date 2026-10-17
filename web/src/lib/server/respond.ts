import "server-only";
import { msg, type AppMessage } from "../../i18n/message";
import type { MessageKey } from "../../i18n/messages/hu";
import { ConfigError, UserError } from "./env";
import { UpstreamError } from "./http";

export function jsonError(error: AppMessage | MessageKey, status: number): Response {
  const body = typeof error === "string" ? msg(error) : error;
  return Response.json({ error: body }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Maps thrown errors to a safe response; internal details only go to the server log. */
export function handleError(scope: string, e: unknown): Response {
  if (e instanceof UserError) return jsonError(e.userMessage, e.status);
  if (e instanceof ConfigError) {
    console.error(`[${scope}] configuration error: ${e.message}`);
    return jsonError("serviceMisconfigured", 503);
  }
  if (e instanceof UpstreamError) {
    console.error(`[${scope}] upstream ${e.service} failed: status=${e.status ?? "-"} ${e.message}`);
    return jsonError("upstreamUnavailable", 502);
  }
  console.error(`[${scope}] unexpected error`, e instanceof Error ? e.message : e);
  return jsonError("unexpectedError", 500);
}
