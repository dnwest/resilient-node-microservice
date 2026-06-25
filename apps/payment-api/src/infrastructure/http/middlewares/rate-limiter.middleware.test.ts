/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import { rateLimiter } from "./rate-limiter.middleware";
import type {
  IRateLimiterStore,
  RateLimitResult,
} from "../../rate-limiting/rate-limiter-store.interface";

function mockReq(ip: string | undefined): Request {
  return { ip } as unknown as Request;
}

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
  };
  return res as Response & { body: unknown; headers: Record<string, string> };
}

function storeReturning(result: RateLimitResult): IRateLimiterStore {
  return { consume: vi.fn().mockResolvedValue(result) };
}

describe("rateLimiter middleware", () => {
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn();
  });

  it("calls next and sets rate-limit headers when allowed", async () => {
    const store = storeReturning({
      allowed: true,
      remaining: 9,
      limit: 20,
      retryAfterMs: 0,
    });

    const res = mockRes();
    await rateLimiter(store)(mockReq("1.2.3.4"), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.headers["X-RateLimit-Limit"]).toBe("20");
    expect(res.headers["X-RateLimit-Remaining"]).toBe("9");
  });

  it("returns 429 + Retry-After when the bucket is exhausted", async () => {
    const store = storeReturning({
      allowed: false,
      remaining: 0,
      limit: 20,
      retryAfterMs: 250,
    });

    const res = mockRes();
    await rateLimiter(store)(mockReq("1.2.3.4"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toBe("1"); // ceil(250ms) => 1s
    expect(res.body).toMatchObject({
      error: expect.stringContaining("Too many requests"),
    });
  });

  it("keys the bucket by client IP", async () => {
    const store = storeReturning({
      allowed: true,
      remaining: 1,
      limit: 20,
      retryAfterMs: 0,
    });

    await rateLimiter(store)(mockReq("9.9.9.9"), mockRes(), next);

    expect(store.consume).toHaveBeenCalledWith("9.9.9.9");
  });

  it("falls back to 'unknown' when no IP is present", async () => {
    const store = storeReturning({
      allowed: true,
      remaining: 1,
      limit: 20,
      retryAfterMs: 0,
    });

    await rateLimiter(store)(mockReq(undefined), mockRes(), next);

    expect(store.consume).toHaveBeenCalledWith("unknown");
  });

  it("supports a custom key generator", async () => {
    const store = storeReturning({
      allowed: true,
      remaining: 1,
      limit: 20,
      retryAfterMs: 0,
    });

    await rateLimiter(store, { keyGenerator: () => "tenant-42" })(
      mockReq("1.2.3.4"),
      mockRes(),
      next,
    );

    expect(store.consume).toHaveBeenCalledWith("tenant-42");
  });

  it("invokes onRejected only when the request is throttled", async () => {
    const onRejected = vi.fn();
    const allowing = storeReturning({
      allowed: true,
      remaining: 1,
      limit: 20,
      retryAfterMs: 0,
    });
    const rejecting = storeReturning({
      allowed: false,
      remaining: 0,
      limit: 20,
      retryAfterMs: 100,
    });

    await rateLimiter(allowing, { onRejected })(
      mockReq("1.2.3.4"),
      mockRes(),
      next,
    );
    expect(onRejected).not.toHaveBeenCalled();

    await rateLimiter(rejecting, { onRejected })(
      mockReq("1.2.3.4"),
      mockRes(),
      next,
    );
    expect(onRejected).toHaveBeenCalledTimes(1);
  });
});
