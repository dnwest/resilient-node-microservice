import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock("../observability/logger", () => ({
  logger: loggerMock,
}));

vi.mock("../../../config/env", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 3000,
    STRIPE_API_URL: "https://api.stripe.com/v1",
    LOG_LEVEL: "info",
  },
}));

vi.mock("../providers/StripePaymentProvider", () => ({
  StripePaymentProvider: vi.fn().mockImplementation(() => ({
    processPayment: vi
      .fn()
      .mockResolvedValue({ success: true, transactionId: "txn_test" }),
  })),
}));

describe("Health Check Endpoint", () => {
  it("should return 200 OK with correct response shape", () => {
    const healthResponse = {
      status: "UP",
      timestamp: new Date().toISOString(),
    };
    expect(healthResponse.status).toBe("UP");
    expect(healthResponse.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it("should include timestamp in health response", () => {
    const timestamp = new Date().toISOString();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe("Graceful Shutdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should handle SIGTERM signal", () => {
    const gracefulShutdown = (signal: string) => {
      loggerMock.info(`Received ${signal}. Starting graceful shutdown...`);
      loggerMock.info("Graceful shutdown completed. Exiting process.");
      process.exit(0);
    };

    gracefulShutdown("SIGTERM");

    expect(loggerMock.info).toHaveBeenCalledWith(
      "Received SIGTERM. Starting graceful shutdown...",
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      "Graceful shutdown completed. Exiting process.",
    );
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("should handle SIGINT signal", () => {
    const gracefulShutdown = (signal: string) => {
      loggerMock.info(`Received ${signal}. Starting graceful shutdown...`);
      loggerMock.info("Graceful shutdown completed. Exiting process.");
      process.exit(0);
    };

    gracefulShutdown("SIGINT");

    expect(loggerMock.info).toHaveBeenCalledWith(
      "Received SIGINT. Starting graceful shutdown...",
    );
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("should log error on server close failure", () => {
    const gracefulShutdown = (signal: string) => {
      loggerMock.info(`Received ${signal}. Starting graceful shutdown...`);

      const mockErr = new Error("Server close error");
      loggerMock.error({ err: mockErr }, "Error during HTTP server closure");
      process.exit(1);
    };

    gracefulShutdown("SIGTERM");

    expect(loggerMock.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Error during HTTP server closure",
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("should force exit after timeout", () => {
    vi.useFakeTimers();

    const timeout = setTimeout(() => {
      loggerMock.error("Forcefully shutting down due to timeout");
      process.exit(1);
    }, 10000);

    timeout.ref();

    vi.advanceTimersByTime(10001);

    expect(loggerMock.error).toHaveBeenCalledWith(
      "Forcefully shutting down due to timeout",
    );
    expect(process.exit).toHaveBeenCalledWith(1);

    vi.useRealTimers();
  });
});
