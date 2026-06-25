import type { Request, Response } from "express";
import type { HealthCheck, HealthStatus } from "./health-check";

export function readinessHandler(checks: HealthCheck[]) {
  return async (_req: Request, res: Response): Promise<void> => {
    const results = await Promise.all(
      checks.map(async (dependency) => ({
        name: dependency.name,
        status: await dependency.check(),
      })),
    );

    const ready = results.every((result) => result.status === "up");
    const dependencies = results.reduce<Record<string, HealthStatus>>(
      (acc, result) => {
        acc[result.name] = result.status;
        return acc;
      },
      {},
    );

    res.status(ready ? 200 : 503).json({
      status: ready ? "READY" : "NOT_READY",
      dependencies,
    });
  };
}
