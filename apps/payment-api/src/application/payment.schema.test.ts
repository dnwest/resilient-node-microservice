import { z } from "zod";
import { describe, it, expect } from "vitest";

const PaymentSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  currency: z.string().length(3, "Currency must be 3 characters (ISO 4217)"),
});

const PaymentResponseSchema = z.object({
  success: z.boolean(),
  transactionId: z.string().optional(),
  reason: z.string().optional(),
});

describe("Payment Schema Validation", () => {
  describe("Valid Payments", () => {
    it("should accept valid USD payment", () => {
      const result = PaymentSchema.safeParse({ amount: 1000, currency: "usd" });
      expect(result.success).toBe(true);
    });

    it("should accept valid EUR payment", () => {
      const result = PaymentSchema.safeParse({ amount: 5000, currency: "eur" });
      expect(result.success).toBe(true);
    });

    it("should accept valid BRL payment", () => {
      const result = PaymentSchema.safeParse({
        amount: 10000,
        currency: "brl",
      });
      expect(result.success).toBe(true);
    });

    it("should accept large amounts", () => {
      const result = PaymentSchema.safeParse({
        amount: 999999999,
        currency: "usd",
      });
      expect(result.success).toBe(true);
    });

    it("should accept minimum valid amount (1)", () => {
      const result = PaymentSchema.safeParse({ amount: 1, currency: "usd" });
      expect(result.success).toBe(true);
    });
  });

  describe("Invalid Amounts", () => {
    it("should reject negative amount", () => {
      const result = PaymentSchema.safeParse({ amount: -100, currency: "usd" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("amount");
      }
    });

    it("should reject zero amount", () => {
      const result = PaymentSchema.safeParse({ amount: 0, currency: "usd" });
      expect(result.success).toBe(false);
    });

    it("should reject non-numeric amount", () => {
      const result = PaymentSchema.safeParse({
        amount: "100",
        currency: "usd",
      });
      expect(result.success).toBe(false);
    });

    it("should reject undefined amount", () => {
      const result = PaymentSchema.safeParse({ currency: "usd" });
      expect(result.success).toBe(false);
    });

    it("should reject missing amount", () => {
      const result = PaymentSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("Invalid Currencies", () => {
    it("should reject currency shorter than 3 characters", () => {
      const result = PaymentSchema.safeParse({ amount: 100, currency: "us" });
      expect(result.success).toBe(false);
    });

    it("should reject currency longer than 3 characters", () => {
      const result = PaymentSchema.safeParse({ amount: 100, currency: "usd2" });
      expect(result.success).toBe(false);
    });

    it("should accept numeric currency as valid 3-char string", () => {
      const result = PaymentSchema.safeParse({ amount: 100, currency: "123" });
      expect(result.success).toBe(true);
    });

    it("should reject missing currency", () => {
      const result = PaymentSchema.safeParse({ amount: 100 });
      expect(result.success).toBe(false);
    });

    it("should reject undefined currency", () => {
      const result = PaymentSchema.safeParse({
        amount: 100,
        currency: undefined,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Payment Response Schema", () => {
    it("should accept success response", () => {
      const result = PaymentResponseSchema.safeParse({
        success: true,
        transactionId: "txn_123",
      });
      expect(result.success).toBe(true);
    });

    it("should accept failure response", () => {
      const result = PaymentResponseSchema.safeParse({
        success: false,
        reason: "SERVICE_UNAVAILABLE_FALLBACK",
      });
      expect(result.success).toBe(true);
    });

    it("should reject response without success field", () => {
      const result = PaymentResponseSchema.safeParse({
        transactionId: "txn_123",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should reject completely empty object", () => {
      const result = PaymentSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should reject null input", () => {
      const result = PaymentSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it("should reject string input", () => {
      const result = PaymentSchema.safeParse("invalid");
      expect(result.success).toBe(false);
    });

    it("should reject array input", () => {
      const result = PaymentSchema.safeParse([
        { amount: 100, currency: "usd" },
      ]);
      expect(result.success).toBe(false);
    });
  });
});
