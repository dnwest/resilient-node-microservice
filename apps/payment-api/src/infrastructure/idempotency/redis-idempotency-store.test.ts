import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { RedisIdempotencyStore } from "./redis-idempotency-store";

const REDIS_URL = process.env.REDIS_URL;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Integration suite: runs only when REDIS_URL is set (CI service container or a
// local `docker run redis`). Skipped otherwise so the unit suite stays green.
describe.skipIf(!REDIS_URL)("RedisIdempotencyStore (integration)", () => {
  let redis: Redis;
  let store: RedisIdempotencyStore;
  let prefix: string;

  beforeAll(() => {
    redis = new Redis(REDIS_URL as string);
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(() => {
    // Unique namespace per test isolates state without flushing the DB.
    prefix = `test:idem:${randomUUID()}:`;
    store = new RedisIdempotencyStore(redis, 10_000, prefix);
  });

  it("reserves a free key for the first caller and returns existing for the second", async () => {
    const first = await store.reserve("key-1", "hash-a");
    expect(first.outcome).toBe("reserved");

    const second = await store.reserve("key-1", "hash-a");
    expect(second.outcome).toBe("existing");
    if (second.outcome === "existing") {
      expect(second.record.status).toBe("in_progress");
      expect(second.record.requestHash).toBe("hash-a");
      expect(second.record.response).toBeNull();
    }
  });

  it("preserves the original requestHash on completion", async () => {
    await store.reserve("key-1", "hash-a");
    await store.complete("key-1", { statusCode: 200, body: { ok: true } });

    const replay = await store.reserve("key-1", "hash-a");
    expect(replay.outcome).toBe("existing");
    if (replay.outcome === "existing") {
      expect(replay.record.status).toBe("completed");
      expect(replay.record.requestHash).toBe("hash-a");
      expect(replay.record.response).toEqual({
        statusCode: 200,
        body: { ok: true },
      });
    }
  });

  it("is a no-op when completing a key that was never reserved", async () => {
    await store.complete("ghost", { statusCode: 200, body: {} });
    const result = await store.reserve("ghost", "hash-a");
    expect(result.outcome).toBe("reserved");
  });

  it("releases a key so it can be reserved again", async () => {
    await store.reserve("key-1", "hash-a");
    await store.release("key-1");

    const result = await store.reserve("key-1", "hash-b");
    expect(result.outcome).toBe("reserved");
  });

  it("expires the reservation after its TTL", async () => {
    const shortLived = new RedisIdempotencyStore(redis, 100, prefix);
    await shortLived.reserve("key-1", "hash-a");

    await sleep(200);

    const result = await shortLived.reserve("key-1", "hash-a");
    expect(result.outcome).toBe("reserved");
  });

  it("enforces idempotency consistently across two store instances (distributed)", async () => {
    const instanceA = new RedisIdempotencyStore(redis, 10_000, prefix);
    const instanceB = new RedisIdempotencyStore(redis, 10_000, prefix);

    const a = await instanceA.reserve("shared-key", "hash-a");
    const b = await instanceB.reserve("shared-key", "hash-a");

    expect(a.outcome).toBe("reserved");
    expect(b.outcome).toBe("existing");
  });
});
