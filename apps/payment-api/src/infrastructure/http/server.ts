import express from "express";
import pinoHttp from "pino-http";
import { logger } from "./observability/logger";
import { env } from "../../config/env";
import { StripePaymentProvider } from "./providers/StripePaymentProvider";
import { idempotency } from "./middlewares/idempotency.middleware";
import { InMemoryIdempotencyStore } from "../idempotency/in-memory-idempotency-store";
import { rateLimiter } from "./middlewares/rate-limiter.middleware";
import { InMemoryTokenBucketStore } from "../rate-limiting/in-memory-token-bucket-store";
import { readinessHandler } from "./health/readiness.handler";

const app = express();
// Honour X-Forwarded-For so req.ip is the real client behind the ALB.
app.set("trust proxy", true);
app.use(express.json());
app.use(pinoHttp({ logger })); // Injects correlation IDs and logs requests

const paymentProvider = new StripePaymentProvider();
const idempotencyStore = new InMemoryIdempotencyStore(
  env.IDEMPOTENCY_TTL_SECONDS * 1000,
);
const rateLimiterStore = new InMemoryTokenBucketStore({
  capacity: env.RATE_LIMIT_CAPACITY,
  refillTokens: env.RATE_LIMIT_REFILL_PER_SECOND,
  refillIntervalMs: 1000,
});

// Liveness: the process is up and serving. Used by the ALB target group.
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "UP", timestamp: new Date().toISOString() });
});

// Readiness: downstream dependencies are reachable. Flips to 503 when the
// payment gateway's circuit breaker is open.
app.get(
  "/ready",
  readinessHandler([
    {
      name: "payment-gateway",
      check: async () => (paymentProvider.isAvailable() ? "up" : "down"),
    },
  ]),
);

app.post(
  "/api/v1/payments",
  rateLimiter(rateLimiterStore),
  idempotency(idempotencyStore),
  async (req, res) => {
    const { amount, currency } = req.body;

    const result = await paymentProvider.processPayment(amount, currency);

    if (!result.success) {
      return res.status(503).json({
        error:
          "Payment service temporarily unavailable. Please try again later.",
      });
    }

    return res.status(200).json(result);
  },
);

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  idempotencyStore.stop();
  rateLimiterStore.stop();

  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error during HTTP server closure");
      process.exit(1);
    }

    logger.info("HTTP server closed. No longer accepting connections.");

    logger.info("Graceful shutdown completed. Exiting process.");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("Forcefully shutting down due to timeout");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
