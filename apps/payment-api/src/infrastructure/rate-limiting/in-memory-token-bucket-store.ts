import type {
  IRateLimiterStore,
  RateLimitResult,
  TokenBucketConfig,
} from "./rate-limiter-store.interface";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

// Single-process token bucket; the event loop serialises refill-and-take per key.
// Each instance keeps its own buckets, so the effective limit scales with the
// instance count until the shared Redis backend lands (project.md #1/#2).
export class InMemoryTokenBucketStore implements IRateLimiterStore {
  private readonly buckets = new Map<string, Bucket>();
  private readonly sweeper: ReturnType<typeof setInterval>;

  constructor(
    private readonly config: TokenBucketConfig,
    sweepIntervalMs = 60_000,
  ) {
    this.sweeper = setInterval(() => this.sweep(), sweepIntervalMs);
    this.sweeper.unref();
  }

  async consume(key: string, cost = 1): Promise<RateLimitResult> {
    const { capacity } = this.config;
    const now = Date.now();

    const bucket = this.buckets.get(key) ?? {
      tokens: capacity,
      lastRefill: now,
    };

    this.refill(bucket, now);

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      this.buckets.set(key, bucket);
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        limit: capacity,
        retryAfterMs: 0,
      };
    }

    this.buckets.set(key, bucket);
    return {
      allowed: false,
      remaining: Math.floor(bucket.tokens),
      limit: capacity,
      retryAfterMs: this.timeToTokens(cost - bucket.tokens),
    };
  }

  stop(): void {
    clearInterval(this.sweeper);
  }

  private refill(bucket: Bucket, now: number): void {
    const { capacity, refillTokens, refillIntervalMs } = this.config;
    const elapsed = now - bucket.lastRefill;
    if (elapsed <= 0) return;

    const refilled = (elapsed / refillIntervalMs) * refillTokens;
    bucket.tokens = Math.min(capacity, bucket.tokens + refilled);
    bucket.lastRefill = now;
  }

  private timeToTokens(tokens: number): number {
    const { refillTokens, refillIntervalMs } = this.config;
    return Math.ceil((tokens / refillTokens) * refillIntervalMs);
  }

  private sweep(): void {
    const { capacity, refillTokens, refillIntervalMs } = this.config;
    const msToFull = (capacity / refillTokens) * refillIntervalMs;
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      this.refill(bucket, now);
      if (bucket.tokens >= capacity && now - bucket.lastRefill >= msToFull) {
        this.buckets.delete(key);
      }
    }
  }
}
