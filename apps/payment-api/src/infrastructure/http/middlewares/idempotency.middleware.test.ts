/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response } from "express";
import { idempotency } from "./idempotency.middleware";
import { InMemoryIdempotencyStore } from "../../idempotency/in-memory-idempotency-store";

vi.mock("../observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function mockReq(key: string | undefined, body: unknown): Request {
  const headers: Record<string, string> = {};
  if (key !== undefined) headers["idempotency-key"] = key;
  return {
    body,
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
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
  return res as Response & {
    body: unknown;
    headers: Record<string, string>;
  };
}

/** Run the middleware, then the downstream handler iff next() was invoked. */
async function dispatch(
  mw: ReturnType<typeof idempotency>,
  req: Request,
  handler?: (req: Request, res: Response) => void | Promise<void>,
) {
  const res = mockRes();
  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });
  if (nextCalled && handler) await handler(req, res);
  return { res, nextCalled };
}

describe("idempotency middleware", () => {
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new InMemoryIdempotencyStore(10_000);
  });

  afterEach(() => {
    store.stop();
  });

  it("passes through when no Idempotency-Key is present", async () => {
    const handler = vi.fn((_req: Request, res: Response) => {
      res.status(200).json({ transactionId: "txn_1" });
    });

    const { res, nextCalled } = await dispatch(
      idempotency(store),
      mockReq(undefined, { amount: 100, currency: "usd" }),
      handler,
    );

    expect(nextCalled).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({ transactionId: "txn_1" });
  });

  it("replays the stored response on a retry with the same key and body (no second gateway call)", async () => {
    const handler = vi.fn((_req: Request, res: Response) => {
      res.status(200).json({ transactionId: "txn_1" });
    });
    const mw = idempotency(store);

    const first = await dispatch(
      mw,
      mockReq("key-1", { amount: 100, currency: "usd" }),
      handler,
    );
    expect(first.res.body).toEqual({ transactionId: "txn_1" });
    expect(handler).toHaveBeenCalledTimes(1);

    // Same body, different key order — must hash identically and replay.
    const retry = await dispatch(
      mw,
      mockReq("key-1", { currency: "usd", amount: 100 }),
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(1); // not invoked again
    expect(retry.nextCalled).toBe(false);
    expect(retry.res.statusCode).toBe(200);
    expect(retry.res.body).toEqual({ transactionId: "txn_1" });
    expect(retry.res.headers["Idempotent-Replayed"]).toBe("true");
  });

  it("rejects a reused key with a different payload as 409 conflict", async () => {
    const handler = vi.fn((_req: Request, res: Response) => {
      res.status(200).json({ transactionId: "txn_1" });
    });
    const mw = idempotency(store);

    await dispatch(mw, mockReq("key-1", { amount: 100, currency: "usd" }), handler);

    const conflict = await dispatch(
      mw,
      mockReq("key-1", { amount: 999, currency: "usd" }),
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(conflict.nextCalled).toBe(false);
    expect(conflict.res.statusCode).toBe(409);
    expect(conflict.res.body).toMatchObject({
      error: expect.stringContaining("different request payload"),
    });
  });

  it("returns 409 + Retry-After while an identical request is still in progress", async () => {
    const inFlight = vi.fn(async () => {
      // Never responds — leaves the reservation in_progress.
    });
    const mw = idempotency(store);

    await dispatch(mw, mockReq("key-1", { amount: 100, currency: "usd" }), inFlight);

    const concurrent = await dispatch(
      mw,
      mockReq("key-1", { amount: 100, currency: "usd" }),
      inFlight,
    );

    expect(concurrent.nextCalled).toBe(false);
    expect(concurrent.res.statusCode).toBe(409);
    expect(concurrent.res.headers["Retry-After"]).toBe("1");
    expect(concurrent.res.body).toMatchObject({
      error: expect.stringContaining("already being processed"),
    });
  });

  it("releases the key on a failed (non-2xx) response so the client can retry", async () => {
    const failing = vi.fn((_req: Request, res: Response) => {
      res.status(503).json({ error: "unavailable" });
    });
    const succeeding = vi.fn((_req: Request, res: Response) => {
      res.status(200).json({ transactionId: "txn_ok" });
    });
    const mw = idempotency(store);

    const failed = await dispatch(
      mw,
      mockReq("key-1", { amount: 100, currency: "usd" }),
      failing,
    );
    expect(failed.res.statusCode).toBe(503);

    const retry = await dispatch(
      mw,
      mockReq("key-1", { amount: 100, currency: "usd" }),
      succeeding,
    );

    expect(succeeding).toHaveBeenCalledTimes(1); // executed again, not replayed
    expect(retry.res.statusCode).toBe(200);
    expect(retry.res.body).toEqual({ transactionId: "txn_ok" });
  });
});
