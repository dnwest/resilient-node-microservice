export interface TokenBucketConfig {
  capacity: number;
  refillTokens: number;
  refillIntervalMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterMs: number;
}

// Port so the in-memory bucket can be swapped for a shared backend (Redis + Lua) — project.md #1/#2.
// consume() lives in the implementation because the refill-and-take step must be atomic per backend.
export interface IRateLimiterStore {
  consume(key: string, cost?: number): Promise<RateLimitResult>;
}
