import { Redis } from "ioredis";
import type { IIdempotencyStore } from "./idempotency/idempotency-store.interface";
import type {
  IRateLimiterStore,
  TokenBucketConfig,
} from "./rate-limiting/rate-limiter-store.interface";
import { InMemoryIdempotencyStore } from "./idempotency/in-memory-idempotency-store";
import { RedisIdempotencyStore } from "./idempotency/redis-idempotency-store";
import { InMemoryTokenBucketStore } from "./rate-limiting/in-memory-token-bucket-store";
import { RedisTokenBucketStore } from "./rate-limiting/redis-token-bucket-store";
import { logger } from "./http/observability/logger";

export interface StoresConfig {
  redisUrl: string | undefined;
  idempotencyTtlMs: number;
  rateLimit: TokenBucketConfig;
}

export interface Stores {
  idempotencyStore: IIdempotencyStore;
  rateLimiterStore: IRateLimiterStore;
  redis?: Redis;
  dispose(): Promise<void>;
}

// Strategy selection: a configured REDIS_URL switches both stores to their
// distributed (Redis) adapters; otherwise they stay in-memory (single-instance).
export function createStores(config: StoresConfig): Stores {
  if (config.redisUrl) {
    const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3 });
    redis.on("error", (err) => logger.error({ err }, "Redis connection error"));

    return {
      idempotencyStore: new RedisIdempotencyStore(
        redis,
        config.idempotencyTtlMs,
      ),
      rateLimiterStore: new RedisTokenBucketStore(redis, config.rateLimit),
      redis,
      dispose: async () => {
        await redis.quit();
      },
    };
  }

  const idempotencyStore = new InMemoryIdempotencyStore(
    config.idempotencyTtlMs,
  );
  const rateLimiterStore = new InMemoryTokenBucketStore(config.rateLimit);

  return {
    idempotencyStore,
    rateLimiterStore,
    dispose: async () => {
      idempotencyStore.stop();
      rateLimiterStore.stop();
    },
  };
}
