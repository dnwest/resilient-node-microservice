import type { NextFunction, Request, Response } from "express";
import type { IRateLimiterStore } from "../../rate-limiting/rate-limiter-store.interface";

export type KeyGenerator = (req: Request) => string;

const byClientIp: KeyGenerator = (req) => req.ip ?? "unknown";

export function rateLimiter(
  store: IRateLimiterStore,
  keyGenerator: KeyGenerator = byClientIp,
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const key = keyGenerator(req);
    const result = await store.consume(key);

    res.setHeader("X-RateLimit-Limit", String(result.limit));
    res.setHeader(
      "X-RateLimit-Remaining",
      String(Math.max(0, result.remaining)),
    );

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: "Too many requests. Please retry later.",
      });
      return;
    }

    next();
  };
}
