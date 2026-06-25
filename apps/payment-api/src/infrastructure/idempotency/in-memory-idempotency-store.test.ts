import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InMemoryIdempotencyStore } from "./in-memory-idempotency-store";

describe("InMemoryIdempotencyStore", () => {
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore(1000);
  });

  afterEach(() => {
    store.stop();
    vi.useRealTimers();
  });

  describe("reserve", () => {
    it("reserves a free key for the first caller", async () => {
      const result = await store.reserve("key-1", "hash-a");
      expect(result.outcome).toBe("reserved");
    });

    it("returns the existing in_progress record for a second caller", async () => {
      await store.reserve("key-1", "hash-a");

      const result = await store.reserve("key-1", "hash-a");

      expect(result.outcome).toBe("existing");
      if (result.outcome === "existing") {
        expect(result.record.status).toBe("in_progress");
        expect(result.record.requestHash).toBe("hash-a");
        expect(result.record.response).toBeNull();
      }
    });

    it("preserves the original requestHash even when reused with another hash", async () => {
      await store.reserve("key-1", "hash-a");

      const result = await store.reserve("key-1", "hash-b");

      expect(result.outcome).toBe("existing");
      if (result.outcome === "existing") {
        expect(result.record.requestHash).toBe("hash-a");
      }
    });
  });

  describe("complete", () => {
    it("marks the record completed and stores the response", async () => {
      await store.reserve("key-1", "hash-a");
      await store.complete("key-1", { statusCode: 200, body: { ok: true } });

      const result = await store.reserve("key-1", "hash-a");
      expect(result.outcome).toBe("existing");
      if (result.outcome === "existing") {
        expect(result.record.status).toBe("completed");
        expect(result.record.response).toEqual({
          statusCode: 200,
          body: { ok: true },
        });
      }
    });

    it("is a no-op when the key was never reserved", async () => {
      await expect(
        store.complete("ghost", { statusCode: 200, body: {} }),
      ).resolves.toBeUndefined();

      const result = await store.reserve("ghost", "hash-a");
      expect(result.outcome).toBe("reserved");
    });
  });

  describe("release", () => {
    it("frees the key so it can be reserved again", async () => {
      await store.reserve("key-1", "hash-a");
      await store.release("key-1");

      const result = await store.reserve("key-1", "hash-b");
      expect(result.outcome).toBe("reserved");
    });
  });

  describe("TTL expiry", () => {
    it("evicts an expired record on access", async () => {
      vi.useFakeTimers();
      const ttlStore = new InMemoryIdempotencyStore(1000);

      await ttlStore.reserve("key-1", "hash-a");
      await ttlStore.complete("key-1", { statusCode: 200, body: { ok: true } });

      vi.advanceTimersByTime(1001);

      const result = await ttlStore.reserve("key-1", "hash-a");
      expect(result.outcome).toBe("reserved");

      ttlStore.stop();
    });

    it("does not evict a record before its TTL elapses", async () => {
      vi.useFakeTimers();
      const ttlStore = new InMemoryIdempotencyStore(1000);

      await ttlStore.reserve("key-1", "hash-a");

      vi.advanceTimersByTime(500);

      const result = await ttlStore.reserve("key-1", "hash-a");
      expect(result.outcome).toBe("existing");

      ttlStore.stop();
    });
  });
});
