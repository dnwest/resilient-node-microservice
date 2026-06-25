/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { readinessHandler } from "./readiness.handler";
import type { HealthCheck, HealthStatus } from "./health-check";

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as Response & { body: any };
}

function check(name: string, status: HealthStatus): HealthCheck {
  return { name, check: vi.fn().mockResolvedValue(status) };
}

describe("readinessHandler", () => {
  it("returns 200 READY when every dependency is up", async () => {
    const res = mockRes();

    await readinessHandler([check("payment-gateway", "up")])(
      {} as Request,
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      status: "READY",
      dependencies: { "payment-gateway": "up" },
    });
  });

  it("returns 503 NOT_READY when any dependency is down", async () => {
    const res = mockRes();

    await readinessHandler([
      check("payment-gateway", "down"),
      check("cache", "up"),
    ])({} as Request, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.status).toBe("NOT_READY");
    expect(res.body.dependencies).toEqual({
      "payment-gateway": "down",
      cache: "up",
    });
  });

  it("evaluates all dependencies in parallel", async () => {
    const gateway = check("payment-gateway", "up");
    const cache = check("cache", "up");
    const res = mockRes();

    await readinessHandler([gateway, cache])({} as Request, res);

    expect(gateway.check).toHaveBeenCalledTimes(1);
    expect(cache.check).toHaveBeenCalledTimes(1);
  });
});
