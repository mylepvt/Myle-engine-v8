const DEFAULT_LIMITS: Record<string, { maxPerMinute: number; circuitBreakerThreshold: number }> = {
  "lead:": { maxPerMinute: 100, circuitBreakerThreshold: 200 },
  "wallet:": { maxPerMinute: 50, circuitBreakerThreshold: 100 },
  "admin:": { maxPerMinute: 200, circuitBreakerThreshold: 400 },
  "presence:": { maxPerMinute: 60, circuitBreakerThreshold: 120 },
  "system:": { maxPerMinute: 30, circuitBreakerThreshold: 60 },
};

const WINDOW_MS = 60_000;
const GLOBAL_WINDOW_MS = 1_000;
const GLOBAL_MAX_PER_SECOND = 500;
const CLEANUP_INTERVAL_MS = 120_000;

export class RateLimiter {
  private buckets = new Map<string, { count: number; windowStart: number; tripped: boolean; tripStart: number }>();
  private globalWindow: { count: number; windowStart: number } = { count: 0, windowStart: Date.now() };
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), CLEANUP_INTERVAL_MS);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  private getLimit(type: string): { maxPerMinute: number; circuitBreakerThreshold: number } {
    for (const [prefix, limit] of Object.entries(DEFAULT_LIMITS)) {
      if (type.startsWith(prefix)) return limit;
    }
    return { maxPerMinute: 60, circuitBreakerThreshold: 120 };
  }

  allow(type: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const limit = this.getLimit(type);

    let bucket = this.buckets.get(type);
    if (!bucket || now - bucket.windowStart > WINDOW_MS) {
      bucket = { count: 0, windowStart: now, tripped: false, tripStart: 0 };
      this.buckets.set(type, bucket);
    }

    if (bucket.tripped) {
      if (now - bucket.tripStart < 60_000) {
        return { allowed: false, reason: "circuit_breaker_open" };
      }
      bucket.tripped = false;
    }

    bucket.count++;

    if (bucket.count > limit.circuitBreakerThreshold) {
      bucket.tripped = true;
      bucket.tripStart = now;
      console.warn(`[rate-limiter] circuit breaker tripped for ${type}`);
      return { allowed: false, reason: "circuit_breaker_tripped" };
    }

    if (bucket.count > limit.maxPerMinute) {
      return { allowed: false, reason: "rate_exceeded" };
    }

    if (now - this.globalWindow.windowStart > GLOBAL_WINDOW_MS) {
      this.globalWindow = { count: 0, windowStart: now };
    }
    this.globalWindow.count++;
    if (this.globalWindow.count > GLOBAL_MAX_PER_SECOND) {
      return { allowed: false, reason: "global_rate_exceeded" };
    }

    return { allowed: true };
  }

  private cleanupExpired() {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart > WINDOW_MS && !bucket.tripped) {
        this.buckets.delete(key);
      }
      if (bucket.tripped && now - bucket.tripStart > 120_000) {
        this.buckets.delete(key);
      }
    }
  }

  reset() {
    this.buckets.clear();
    this.globalWindow = { count: 0, windowStart: Date.now() };
  }

  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.reset();
  }
}
