import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InMemoryTokenBucketStore } from "./in-memory-token-bucket-store";

describe("InMemoryTokenBucketStore", () => {
  let store: InMemoryTokenBucketStore;

  beforeEach(() => {
    vi.useFakeTimers();
    // 5 token burst, refilling 10 tokens/sec (1 token per 100ms).
    store = new InMemoryTokenBucketStore({
      capacity: 5,
      refillTokens: 10,
      refillIntervalMs: 1000,
    });
  });

  afterEach(() => {
    store.stop();
    vi.useRealTimers();
  });

  it("allows a burst up to capacity, then rejects", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await store.consume("ip-1");
      expect(result.allowed).toBe(true);
    }

    const overflow = await store.consume("ip-1");
    expect(overflow.allowed).toBe(false);
    expect(overflow.remaining).toBe(0);
    expect(overflow.limit).toBe(5);
  });

  it("reports a Retry-After that matches the refill rate", async () => {
    for (let i = 0; i < 5; i++) await store.consume("ip-1");

    const rejected = await store.consume("ip-1");
    expect(rejected.allowed).toBe(false);
    // 1 token at 10 tokens/sec => 100ms to recover.
    expect(rejected.retryAfterMs).toBe(100);
  });

  it("refills over time so sustained traffic is shaped to the rate", async () => {
    for (let i = 0; i < 5; i++) await store.consume("ip-1");
    expect((await store.consume("ip-1")).allowed).toBe(false);

    // After 300ms, 3 tokens (10/sec) should have refilled.
    vi.advanceTimersByTime(300);

    expect((await store.consume("ip-1")).allowed).toBe(true);
    expect((await store.consume("ip-1")).allowed).toBe(true);
    expect((await store.consume("ip-1")).allowed).toBe(true);
    expect((await store.consume("ip-1")).allowed).toBe(false);
  });

  it("never refills beyond capacity", async () => {
    await store.consume("ip-1"); // 4 left
    vi.advanceTimersByTime(10_000); // would refill 100 tokens, but caps at 5

    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if ((await store.consume("ip-1")).allowed) allowed++;
    }
    expect(allowed).toBe(5);
  });

  it("tracks buckets independently per key", async () => {
    for (let i = 0; i < 5; i++) await store.consume("ip-1");
    expect((await store.consume("ip-1")).allowed).toBe(false);

    // A different client is unaffected.
    expect((await store.consume("ip-2")).allowed).toBe(true);
  });

  it("decrements remaining as tokens are consumed", async () => {
    const first = await store.consume("ip-1");
    expect(first.remaining).toBe(4);

    const second = await store.consume("ip-1");
    expect(second.remaining).toBe(3);
  });
});
