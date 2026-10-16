import "server-only";

export class UpstreamError extends Error {
  constructor(
    readonly service: string,
    readonly status: number | null,
    message: string,
  ) {
    super(`${service}: ${message}`);
  }
}

/** fetch + JSON with a timeout; never logs or returns URLs (they may contain keys). */
export async function fetchJson<T>(
  service: string,
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (e) {
    const reason = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network error";
    throw new UpstreamError(service, null, reason);
  }
  if (!res.ok) {
    throw new UpstreamError(service, res.status, `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
