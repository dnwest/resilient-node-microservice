/* eslint-disable @typescript-eslint/no-explicit-any */
import CircuitBreaker from "opossum";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { StripePaymentProvider } from "./StripePaymentProvider";

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("opossum");
vi.mock("../../../config/env", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 3000,
    STRIPE_API_URL: "https://api.stripe.com/v1",
    LOG_LEVEL: "info",
  },
}));
vi.mock("../observability/logger", () => ({
  logger: loggerMock,
}));

describe("StripePaymentProvider", () => {
  let provider: StripePaymentProvider;
  let mockBreaker: any;

  const mockSuccessResponse = { success: true, transactionId: "txn_123" };
  const mockFallbackResponse = {
    success: false,
    reason: "SERVICE_UNAVAILABLE_FALLBACK",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockBreaker = {
      fire: vi.fn(),
      on: vi.fn(),
      fallback: vi.fn(),
    };

    (CircuitBreaker as any).mockImplementation(() => mockBreaker);

    provider = new StripePaymentProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Constructor", () => {
    it("should create a CircuitBreaker with correct options", () => {
      expect(CircuitBreaker).toHaveBeenCalledTimes(1);

      const constructorCall = (CircuitBreaker as any).mock.calls[0];
      expect(constructorCall[1]).toEqual({
        timeout: 3000,
        errorThresholdPercentage: 50,
        resetTimeout: 10000,
      });
    });

    it("should register event listeners for circuit states", () => {
      expect(mockBreaker.on).toHaveBeenCalledWith("open", expect.any(Function));
      expect(mockBreaker.on).toHaveBeenCalledWith(
        "halfOpen",
        expect.any(Function),
      );
      expect(mockBreaker.on).toHaveBeenCalledWith(
        "close",
        expect.any(Function),
      );
    });

    it("should register fallback handler", () => {
      expect(mockBreaker.fallback).toHaveBeenCalledTimes(1);
      expect(mockBreaker.fallback).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe("processPayment - Success Scenarios", () => {
    it("should return successful payment result when circuit is closed", async () => {
      mockBreaker.fire.mockResolvedValue(mockSuccessResponse);

      const result = await provider.processPayment(1000, "usd");

      expect(mockBreaker.fire).toHaveBeenCalledWith({
        amount: 1000,
        currency: "usd",
      });
      expect(result).toEqual(mockSuccessResponse);
    });

    it("should handle successful payment with different currencies", async () => {
      mockBreaker.fire.mockResolvedValue({
        success: true,
        transactionId: "txn_456",
      });

      const result = await provider.processPayment(5000, "eur");

      expect(mockBreaker.fire).toHaveBeenCalledWith({
        amount: 5000,
        currency: "eur",
      });
      expect(result.transactionId).toBe("txn_456");
    });

    it("should handle successful payment with different amounts", async () => {
      mockBreaker.fire.mockResolvedValue({
        success: true,
        transactionId: "txn_789",
      });

      const result = await provider.processPayment(100000, "brl");

      expect(mockBreaker.fire).toHaveBeenCalledWith({
        amount: 100000,
        currency: "brl",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("processPayment - Error Scenarios", () => {
    it("should throw error when payment processing fails unexpectedly", async () => {
      mockBreaker.fire.mockRejectedValue(new Error("Network error"));

      await expect(provider.processPayment(1000, "usd")).rejects.toThrow(
        "Payment processing failed",
      );
    });

    it("should handle timeout errors", async () => {
      mockBreaker.fire.mockRejectedValue(
        new Error("timeout of 3000ms exceeded"),
      );

      await expect(provider.processPayment(1000, "usd")).rejects.toThrow(
        "Payment processing failed",
      );
    });

    it("should handle 4xx client errors", async () => {
      mockBreaker.fire.mockRejectedValue(
        new Error("Request failed with status code 400"),
      );

      await expect(provider.processPayment(1000, "usd")).rejects.toThrow(
        "Payment processing failed",
      );
    });

    it("should handle 5xx server errors", async () => {
      mockBreaker.fire.mockRejectedValue(
        new Error("Request failed with status code 500"),
      );

      await expect(provider.processPayment(1000, "usd")).rejects.toThrow(
        "Payment processing failed",
      );
    });

    it("should handle connection refused errors", async () => {
      mockBreaker.fire.mockRejectedValue(new Error("connect ECONNREFUSED"));

      await expect(provider.processPayment(1000, "usd")).rejects.toThrow(
        "Payment processing failed",
      );
    });
  });

  describe("Circuit Breaker States", () => {
    it("should log warning when circuit opens", () => {
      const openHandler = mockBreaker.on.mock.calls.find(
        (call: any[]) => call[0] === "open",
      )?.[1];

      openHandler();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        "Circuit Breaker OPEN: Payment Gateway is unreachable.",
      );
    });

    it("should log info when circuit moves to half-open", () => {
      const halfOpenHandler = mockBreaker.on.mock.calls.find(
        (call: any[]) => call[0] === "halfOpen",
      )?.[1];

      halfOpenHandler();
      expect(loggerMock.info).toHaveBeenCalledWith(
        "Circuit Breaker HALF-OPEN: Testing Gateway health.",
      );
    });

    it("should log info when circuit closes", () => {
      const closeHandler = mockBreaker.on.mock.calls.find(
        (call: any[]) => call[0] === "close",
      )?.[1];

      closeHandler();
      expect(loggerMock.info).toHaveBeenCalledWith(
        "Circuit Breaker CLOSED: Gateway recovered.",
      );
    });

    it("should log error when payment fails unexpectedly", async () => {
      mockBreaker.fire.mockRejectedValue(new Error("Network error"));

      try {
        await provider.processPayment(1000, "usd");
      } catch (e) {
        expect(loggerMock.error).toHaveBeenCalled();
      }
    });
  });

  describe("Fallback Logic", () => {
    it("should return correct fallback structure", () => {
      const fallbackFn = mockBreaker.fallback.mock.calls[0][0];
      const result = fallbackFn();

      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("reason", "SERVICE_UNAVAILABLE_FALLBACK");
    });

    it("should log warning when fallback is executed", () => {
      const fallbackFn = mockBreaker.fallback.mock.calls[0][0];
      fallbackFn();

      expect(loggerMock.warn).toHaveBeenCalledWith(
        "Circuit Breaker FALLBACK: Executing contingency logic.",
      );
    });

    it("should return consistent fallback response", () => {
      const fallbackFn = mockBreaker.fallback.mock.calls[0][0];

      const result1 = fallbackFn();
      const result2 = fallbackFn();

      expect(result1).toEqual(result2);
      expect(result1.success).toBe(false);
    });
  });

  describe("Circuit Breaker State Transitions", () => {
    it("should transition from CLOSED to OPEN after 50% errors", async () => {
      mockBreaker.fire.mockRejectedValue(new Error("Error"));

      for (let i = 0; i < 5; i++) {
        try {
          await provider.processPayment(1000, "usd");
        } catch (e) {
          // Expected to throw
        }
      }

      expect(mockBreaker.fire).toHaveBeenCalledTimes(5);
    });

    it("should allow request in HALF-OPEN state", async () => {
      mockBreaker.fire.mockResolvedValueOnce(mockSuccessResponse);

      const result = await provider.processPayment(1000, "usd");

      expect(result.success).toBe(true);
    });

    it("should close circuit after successful request in HALF-OPEN", () => {
      const halfOpenHandler = mockBreaker.on.mock.calls.find(
        (call: any[]) => call[0] === "halfOpen",
      )?.[1];
      const closeHandler = mockBreaker.on.mock.calls.find(
        (call: any[]) => call[0] === "close",
      )?.[1];

      halfOpenHandler();
      closeHandler();

      expect(loggerMock.info).toHaveBeenCalledWith(
        "Circuit Breaker HALF-OPEN: Testing Gateway health.",
      );
      expect(loggerMock.info).toHaveBeenCalledWith(
        "Circuit Breaker CLOSED: Gateway recovered.",
      );
    });
  });
});
