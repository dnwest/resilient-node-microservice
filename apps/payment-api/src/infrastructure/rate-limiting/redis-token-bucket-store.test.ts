import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { RedisTokenBucketStore } from "./redis-token-bucket-store";

const REDIS_URL = process.env.REDIS_URL;

// Integration suite: runs only when REDIS_URL is set. A controllable clock makes
// refill behaviour deterministic without real waits.
describe.skipIf(!REDIS_URL)("RedisTokenBucketStore (integration)", () => {
  let redis: Redis;
  let prefix: string;
  let clock: number;
  const now = () => clock;

  const config = { capacity: 5, refillTokens: 10, refillIntervalMs: 1000 };

  function makeStore() {
    return new RedisTokenBucketStore(redis, config, prefix, now);
  }

  beforeAll(() => {
    redis = new Redis(REDIS_URL as string);
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(() => {
    prefix = `test:rl:${randomUUID()}:`;
    clock = 1_000_000;
  });

  it("allows a burst up to capacity, then rejects", async () => {
    const store = makeStore();

    for (let i = 0; i < 5; i++) {
      expect((await store.consume("ip-1")).allowed).toBe(true);
    }

    const overflow = await store.consume("ip-1");
    expect(overflow.allowed).toBe(false);
    expect(overflow.remaining).toBe(0);
    expect(overflow.limit).toBe(5);
    expect(overflow.retryAfterMs).toBe(100); // 1 token at 10/sec
  });

  it("refills over elapsed time so sustained traffic is shaped to the rate", async () => {
    const store = makeStore();
    for (let i = 0; i < 5; i++) await store.consume("ip-1");
    expect((await store.consume("ip-1")).allowed).toBe(false);

    clock += 300; // 3 tokens refilled at 10/sec

    expect((await store.consume("ip-1")).allowed).toBe(true);
    expect((await store.consume("ip-1")).allowed).toBe(true);
    expect((await store.consume("ip-1")).allowed).toBe(true);
    expect((await store.consume("ip-1")).allowed).toBe(false);
  });

  it("never refills beyond capacity", async () => {
    const store = makeStore();
    await store.consume("ip-1");
    clock += 10_000; // would refill 100 tokens, capped at 5

    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if ((await store.consume("ip-1")).allowed) allowed++;
    }
    expect(allowed).toBe(5);
  });

  it("enforces one shared limit across instances (distributed)", async () => {
    const instanceA = makeStore();
    const instanceB = makeStore();

    // Two instances draining the same bucket must not exceed capacity combined.
    let allowed = 0;
    for (let i = 0; i < 8; i++) {
      const store = i % 2 === 0 ? instanceA : instanceB;
      if ((await store.consume("shared-ip")).allowed) allowed++;
    }
    expect(allowed).toBe(5);
  });
});
