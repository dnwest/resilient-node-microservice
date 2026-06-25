import type { NextFunction, Request, Response } from "express";
import type { Metrics } from "../observability/metrics";

export function httpMetrics(metrics: Metrics) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const stopTimer = metrics.httpRequestDuration.startTimer();

    res.on("finish", () => {
      // req.route is set once a handler matches; bucket the rest under "unmatched"
      // to keep label cardinality bounded.
      const route = req.route?.path ?? "unmatched";
      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };
      stopTimer(labels);
      metrics.httpRequestsTotal.inc(labels);
    });

    next();
  };
}
