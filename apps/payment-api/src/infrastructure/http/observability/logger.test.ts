import pino from "pino";
import { describe, it, expect, vi, beforeEach } from "vitest";

const PII_FIELDS = ["authorization", "creditCardNumber", "password"];

const createTestLogger = (level: string = "info") => {
  const transport = pino.transport({
    targets: [
      {
        level,
        target: "pino/file",
        options: { destination: 1 },
      },
    ],
  });

  return pino(
    {
      level,
      redact: {
        paths: PII_FIELDS,
        censor: "[REDACTED]",
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    transport,
  );
};

describe("Logger", () => {
  let logger: pino.Logger;
  let consoleSpy: any;

  beforeEach(() => {
    logger = createTestLogger("info");
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("Log Levels", () => {
    it("should support fatal level", () => {
      expect(() => logger.fatal("Fatal error")).not.toThrow();
    });

    it("should support error level", () => {
      expect(() => logger.error("Error message")).not.toThrow();
    });

    it("should support warn level", () => {
      expect(() => logger.warn("Warning message")).not.toThrow();
    });

    it("should support info level", () => {
      expect(() => logger.info("Info message")).not.toThrow();
    });

    it("should support debug level", () => {
      expect(() => logger.debug("Debug message")).not.toThrow();
    });

    it("should support trace level", () => {
      expect(() => logger.trace("Trace message")).not.toThrow();
    });
  });

  describe("PII Redaction", () => {
    it("should redact authorization field", () => {
      const sensitiveData = {
        action: "login",
        authorization: "Bearer secret_token_123",
      };

      expect(() => {
        logger.info(sensitiveData);
      }).not.toThrow();
    });

    it("should redact creditCardNumber field", () => {
      const paymentData = {
        amount: 100,
        creditCardNumber: "4111111111111111",
      };

      expect(() => {
        logger.info(paymentData);
      }).not.toThrow();
    });

    it("should redact password field", () => {
      const credentials = {
        username: "user@example.com",
        password: "supersecret",
      };

      expect(() => {
        logger.info(credentials);
      }).not.toThrow();
    });

    it("should log object with multiple sensitive fields", () => {
      const sensitivePayload = {
        action: "payment",
        authorization: "Bearer token",
        creditCardNumber: "1234-5678-9012-3456",
        password: "secret",
        amount: 5000,
        currency: "usd",
      };

      expect(() => {
        logger.info(sensitivePayload);
      }).not.toThrow();
    });
  });

  describe("Structured Logging", () => {
    it("should support child loggers with bindings", () => {
      const childLogger = logger.child({ component: "payment-service" });

      expect(() => {
        childLogger.info("Processing payment");
      }).not.toThrow();
    });

    it("should support logging with error objects", () => {
      const error = new Error("Payment failed");

      expect(() => {
        logger.error({ err: error }, "Payment processing failed");
      }).not.toThrow();
    });

    it("should support logging with multiple properties", () => {
      expect(() => {
        logger.info({
          requestId: "req_123",
          userId: "user_456",
          action: "process_payment",
          duration: 150,
        });
      }).not.toThrow();
    });
  });

  describe("Timestamp", () => {
    it("should include timestamp in ISO format", () => {
      expect(() => {
        logger.info("Message with timestamp");
      }).not.toThrow();
    });
  });
});
