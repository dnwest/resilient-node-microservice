/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStores, type StoresConfig } from "./create-stores";
import { InMemoryIdempotencyStore } from "./idempotency/in-memory-idempotency-store";
import { InMemoryTokenBucketStore } from "./rate-limiting/in-memory-token-bucket-store";
import { RedisIdempotencyStore } from "./idempotency/redis-idempotency-store";
import { RedisTokenBucketStore } from "./rate-limiting/redis-token-bucket-store";

const redisInstance = {
  on: vi.fn(),
  quit: vi.fn().mockResolvedValue("OK"),
  status: "ready",
};

vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(() => redisInstance),
}));

vi.mock("./http/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const baseConfig: Omit<StoresConfig, "redisUrl"> = {
  idempotencyTtlMs: 10_000,
  rateLimit: { capacity: 20, refillTokens: 10, refillIntervalMs: 1000 },
};

describe("createStores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("without REDIS_URL (in-memory)", () => {
    it("builds in-memory stores and no redis client", async () => {
      const stores = createStores({ ...baseConfig, redisUrl: undefined });

      expect(stores.idempotencyStore).toBeInstanceOf(InMemoryIdempotencyStore);
      expect(stores.rateLimiterStore).toBeInstanceOf(InMemoryTokenBucketStore);
      expect(stores.redis).toBeUndefined();

      await expect(stores.dispose()).resolves.toBeUndefined();
    });
  });

  describe("with REDIS_URL (distributed)", () => {
    it("builds redis-backed stores and exposes the client", async () => {
      const stores = createStores({
        ...baseConfig,
        redisUrl: "redis://localhost:6379",
      });

      expect(stores.idempotencyStore).toBeInstanceOf(RedisIdempotencyStore);
      expect(stores.rateLimiterStore).toBeInstanceOf(RedisTokenBucketStore);
      expect(stores.redis).toBe(redisInstance);
    });

    it("registers an error handler and quits the client on dispose", async () => {
      const stores = createStores({
        ...baseConfig,
        redisUrl: "redis://localhost:6379",
      });

      expect(redisInstance.on).toHaveBeenCalledWith(
        "error",
        expect.any(Function),
      );

      await stores.dispose();
      expect(redisInstance.quit).toHaveBeenCalledTimes(1);
    });
  });
});
