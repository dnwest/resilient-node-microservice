import type { Redis } from "ioredis";
import type {
  IRateLimiterStore,
  RateLimitResult,
  TokenBucketConfig,
} from "./rate-limiter-store.interface";

// Atomic token-bucket consume: refill by elapsed time, take `cost` if available,
// persist the new state with a TTL, and return [allowed, remaining, retryAfterMs].
const CONSUME_LUA = `
local capacity = tonumber(ARGV[1])
local refillTokens = tonumber(ARGV[2])
local interval = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local cost = tonumber(ARGV[5])

local state = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts = tonumber(state[2])
if tokens == nil then
  tokens = capacity
  ts = now
end

local elapsed = now - ts
if elapsed > 0 then
  tokens = math.min(capacity, tokens + (elapsed / interval) * refillTokens)
  ts = now
end

local allowed = 0
local retryAfter = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  retryAfter = math.ceil(((cost - tokens) / refillTokens) * interval)
end

redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', ts)
redis.call('PEXPIRE', KEYS[1], math.ceil((capacity / refillTokens) * interval))

return { allowed, math.floor(tokens), retryAfter }
`;

/**
 * Distributed token-bucket rate limiter backed by Redis, so the limit is enforced
 * consistently across every instance. The refill-and-take step runs as a single
 * Lua script, which Redis executes atomically — no read/modify/write race.
 */
export class RedisTokenBucketStore implements IRateLimiterStore {
  constructor(
    private readonly redis: Redis,
    private readonly config: TokenBucketConfig,
    private readonly keyPrefix = "rl:",
    private readonly now: () => number = () => Date.now(),
  ) {}

  async consume(key: string, cost = 1): Promise<RateLimitResult> {
    const { capacity, refillTokens, refillIntervalMs } = this.config;

    const [allowed, remaining, retryAfterMs] = (await this.redis.eval(
      CONSUME_LUA,
      1,
      `${this.keyPrefix}${key}`,
      capacity,
      refillTokens,
      refillIntervalMs,
      this.now(),
      cost,
    )) as [number, number, number];

    return {
      allowed: allowed === 1,
      remaining,
      limit: capacity,
      retryAfterMs,
    };
  }
}
