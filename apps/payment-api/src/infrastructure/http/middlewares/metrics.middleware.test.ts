/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { httpMetrics } from "./metrics.middleware";
import { createMetrics } from "../observability/metrics";

function mockReq(method: string, routePath?: string): Request {
  return {
    method,
    route: routePath ? { path: routePath } : undefined,
  } as unknown as Request;
}

// Captures the 'finish' listener so the test can fire it deterministically.
function mockRes(statusCode: number) {
  let finish: (() => void) | undefined;
  const res: any = {
    statusCode,
    on(event: string, cb: () => void) {
      if (event === "finish") finish = cb;
      return this;
    },
    emitFinish() {
      finish?.();
    },
  };
  return res as Response & { emitFinish: () => void };
}

describe("httpMetrics middleware", () => {
  it("records a request with method/route/status labels on finish", async () => {
    const metrics = createMetrics();
    const next = vi.fn();
    const res = mockRes(200);

    httpMetrics(metrics)(mockReq("POST", "/api/v1/payments"), res, next);
    expect(next).toHaveBeenCalledTimes(1);

    res.emitFinish();

    const output = await metrics.registry.metrics();
    expect(output).toMatch(
      /http_requests_total\{method="POST",route="\/api\/v1\/payments",status_code="200"\} 1/,
    );
    expect(output).toContain("http_request_duration_seconds_count");
  });

  it("labels unmatched routes as 'unmatched'", async () => {
    const metrics = createMetrics();
    const res = mockRes(404);

    httpMetrics(metrics)(mockReq("GET"), res, vi.fn());
    res.emitFinish();

    const output = await metrics.registry.metrics();
    expect(output).toMatch(
      /http_requests_total\{method="GET",route="unmatched",status_code="404"\} 1/,
    );
  });
});
