/** Sends an anonymous usage event to /api/t without delaying anything (see /stat). */
export function sendEvent(type: string, data: Record<string, string | boolean | undefined> = {}): void {
  try {
    const body = JSON.stringify({ type, ...data });
    if (navigator.sendBeacon?.("/api/t", new Blob([body], { type: "text/plain" }))) return;
    void fetch("/api/t", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // statistics are best effort
  }
}
