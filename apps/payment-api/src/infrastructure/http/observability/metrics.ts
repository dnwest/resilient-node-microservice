import type { Request, Response } from "express";
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

export type BreakerState = "closed" | "open" | "halfOpen";

const BREAKER_STATE_VALUE: Record<BreakerState, number> = {
  closed: 0,
  halfOpen: 1,
  open: 2,
};

export interface Metrics {
  registry: Registry;
  httpRequestsTotal: Counter;
  httpRequestDuration: Histogram;
  rateLimitRejectionsTotal: Counter;
  observeCircuitBreaker(name: string, getState: () => BreakerState): void;
}

// Factory (no module-level singletons) so each instance — and every test — owns
// an isolated registry, avoiding prom-client's duplicate-registration errors.
export function createMetrics(): Metrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const labelNames = ["method", "route", "status_code"] as const;

  const httpRequestsTotal = new Counter({
    name: "http_requests_total",
    help: "Total number of HTTP requests.",
    labelNames,
    registers: [registry],
  });

  const httpRequestDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request latency in seconds.",
    labelNames,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  const rateLimitRejectionsTotal = new Counter({
    name: "rate_limit_rejections_total",
    help: "Total number of requests rejected by the rate limiter.",
    labelNames: ["route"] as const,
    registers: [registry],
  });

  function observeCircuitBreaker(
    name: string,
    getState: () => BreakerState,
  ): void {
    new Gauge({
      name: "circuit_breaker_state",
      help: "Circuit breaker state (0=closed, 1=half-open, 2=open).",
      labelNames: ["name"] as const,
      registers: [registry],
      collect() {
        this.set({ name }, BREAKER_STATE_VALUE[getState()]);
      },
    });
  }

  return {
    registry,
    httpRequestsTotal,
    httpRequestDuration,
    rateLimitRejectionsTotal,
    observeCircuitBreaker,
  };
}

export function metricsHandler(metrics: Metrics) {
  return async (_req: Request, res: Response): Promise<void> => {
    res.setHeader("Content-Type", metrics.registry.contentType);
    res.send(await metrics.registry.metrics());
  };
}
