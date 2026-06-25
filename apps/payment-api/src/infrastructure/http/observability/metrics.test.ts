/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { createMetrics, metricsHandler, type BreakerState } from "./metrics";

describe("createMetrics", () => {
  it("registers the custom metrics in the registry output", async () => {
    const metrics = createMetrics();

    const output = await metrics.registry.metrics();

    expect(output).toContain("http_requests_total");
    expect(output).toContain("http_request_duration_seconds");
    expect(output).toContain("rate_limit_rejections_total");
  });

  it("exposes incremented counters in the exposition format", async () => {
    const metrics = createMetrics();

    metrics.httpRequestsTotal.inc({
      method: "POST",
      route: "/api/v1/payments",
      status_code: "200",
    });
    metrics.rateLimitRejectionsTotal.inc({ route: "/api/v1/payments" });

    const output = await metrics.registry.metrics();

    expect(output).toMatch(
      /http_requests_total\{method="POST",route="\/api\/v1\/payments",status_code="200"\} 1/,
    );
    expect(output).toMatch(
      /rate_limit_rejections_total\{route="\/api\/v1\/payments"\} 1/,
    );
  });

  it("reports the circuit breaker state via the pull-based gauge", async () => {
    const metrics = createMetrics();
    let state: BreakerState = "closed";
    metrics.observeCircuitBreaker("payment-gateway", () => state);

    let output = await metrics.registry.metrics();
    expect(output).toContain('circuit_breaker_state{name="payment-gateway"} 0');

    state = "open";
    output = await metrics.registry.metrics();
    expect(output).toContain('circuit_breaker_state{name="payment-gateway"} 2');
  });

  it("isolates registries between instances", async () => {
    const a = createMetrics();
    const b = createMetrics();

    a.httpRequestsTotal.inc({
      method: "GET",
      route: "/health",
      status_code: "200",
    });

    const outputB = await b.registry.metrics();
    expect(outputB).not.toMatch(/http_requests_total\{[^}]*route="\/health"/);
  });
});

describe("metricsHandler", () => {
  it("responds with the Prometheus content type and body", async () => {
    const metrics = createMetrics();
    const res = {
      setHeader: vi.fn(),
      send: vi.fn(),
    } as unknown as Response & { setHeader: any; send: any };

    await metricsHandler(metrics)({} as Request, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      metrics.registry.contentType,
    );
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining("# HELP"));
  });
});
