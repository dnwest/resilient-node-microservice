import CircuitBreaker from "opossum";
import axios from "axios";
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
vi.mock("axios");
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

  describe("processPayment", () => {
    it("should return successful payment result when circuit is closed", async () => {
      mockBreaker.fire.mockResolvedValue(mockSuccessResponse);

      const result = await provider.processPayment(1000, "usd");

      expect(mockBreaker.fire).toHaveBeenCalledWith({
        amount: 1000,
        currency: "usd",
      });
      expect(result).toEqual(mockSuccessResponse);
    });

    it("should return fallback response when circuit is open", () => {
      const fallbackFn = mockBreaker.fallback.mock.calls[0][0];

      const fallbackResult = fallbackFn();
      expect(fallbackResult).toEqual(mockFallbackResponse);
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

    it("should throw error when payment processing fails unexpectedly", async () => {
      mockBreaker.fire.mockRejectedValue(new Error("Network error"));

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
  });
});
