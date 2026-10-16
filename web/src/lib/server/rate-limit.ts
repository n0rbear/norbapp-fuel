import "server-only";

type Bucket = { tokens: number; updatedAt: number };

/**
 * In-memory token bucket per client IP. Good enough for a single instance;
 * it protects the shared public OSM services and the station APIs from abuse.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMinute: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    if (this.buckets.size > 10_000) this.buckets.clear();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const refill = ((now - bucket.updatedAt) / 60_000) * this.refillPerMinute;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + refill);
    bucket.updatedAt = now;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return allowed;
  }
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
