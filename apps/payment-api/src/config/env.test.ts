import { z } from "zod";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("dotenv/config");

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("3000").transform(Number),
  STRIPE_API_URL: z.string().url(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

describe("Environment Schema Validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("NODE_ENV validation", () => {
    it("should accept valid NODE_ENV values", () => {
      process.env.STRIPE_API_URL = "https://api.stripe.com/v1";

      const validValues = ["development", "production", "test"] as const;

      for (const value of validValues) {
        process.env.NODE_ENV = value;
        const result = envSchema.safeParse(process.env);
        expect(result.success).toBe(true);
        expect(result.data?.NODE_ENV).toBe(value);
      }
    });

    it("should default to development when NODE_ENV is not set", () => {
      process.env.STRIPE_API_URL = "https://api.stripe.com/v1";
      delete process.env.NODE_ENV;

      const result = envSchema.safeParse(process.env);
      expect(result.success).toBe(true);
      expect(result.data?.NODE_ENV).toBe("development");
    });

    it("should reject invalid NODE_ENV values", () => {
      process.env.STRIPE_API_URL = "https://api.stripe.com/v1";
      process.env.NODE_ENV = "invalid";

      const result = envSchema.safeParse(process.env);
      expect(result.success).toBe(false);
    });
  });

  describe("PORT validation", () => {
    it("should accept valid PORT values", () => {
      process.env.STRIPE_API_URL = "https://api.stripe.com/v1";
      process.env.PORT = "8080";

      const result = envSchema.safeParse(process.env);
      expect(result.success).toBe(true);
      expect(result.data?.PORT).toBe(8080);
      expect(typeof result.data?.PORT).toBe("number");
    });

    it("should default to 3000 when PORT is not set", () => {
      process.env.STRIPE_API_URL = "https://api.stripe.com/v1";
      delete process.env.PORT;

      const result = envSchema.safeParse(process.env);
      expect(result.success).toBe(true);
      expect(result.data?.PORT).toBe(3000);
    });

    it("should transform string PORT to number", () => {
      process.env.STRIPE_API_URL = "https://api.stripe.com/v1";
      process.env.PORT = "3001";

      const result = envSchema.safeParse(process.env);
      expect(result.success).toBe(true);
      expect(result.data?.PORT).toBeTypeOf("number");
    });
  });

  describe("STRIPE_API_URL validation", () => {
    it("should accept valid HTTPS URL", () => {
      process.env.STRIPE_API_URL = "https://api.stripe.com/v1";

      const result = envSchema.safeParse(process.env);
      expect(result.success).toBe(true);
      expect(result.data?.STRIPE_API_URL).toBe("https://api.stripe.com/v1");
    });

    it("should reject invalid URLs", () => {
      process.env.STRIPE_API_URL = "not-a-url";

      const result = envSchema.safeParse(process.env);
      expect(result.success).toBe(false);
    });

    it("should reject URLs without protocol", () => {
      process.env.STRIPE_API_URL = "api.stripe.com/v1";

      const result = envSchema.safeParse(process.env);
      expect(result.success).toBe(false);
    });

    it("should reject missing STRIPE_API_URL", () => {
      delete process.env.STRIPE_API_URL;

      const result = envSchema.safeParse(process.env);
      expect(result.success).toBe(false);
    });
  });

  describe("LOG_LEVEL validation", () => {
    it("should accept valid LOG_LEVEL values", () => {
      process.env.STRIPE_API_URL = "https://api.stripe.com/v1";

      const validLevels = [
        "fatal",
        "error",
        "warn",
        "info",
        "debug",
        "trace",
      ] as const;

      for (const level of validLevels) {
        process.env.LOG_LEVEL = level;
        const result = envSchema.safeParse(process.env);
        expect(result.success).toBe(true);
        expect(result.data?.LOG_LEVEL).toBe(level);
      }
    });

    it("should default to info when LOG_LEVEL is not set", () => {
      process.env.STRIPE_API_URL = "https://api.stripe.com/v1";
      delete process.env.LOG_LEVEL;

      const result = envSchema.safeParse(process.env);
      expect(result.success).toBe(true);
      expect(result.data?.LOG_LEVEL).toBe("info");
    });

    it("should reject invalid LOG_LEVEL values", () => {
      process.env.STRIPE_API_URL = "https://api.stripe.com/v1";
      process.env.LOG_LEVEL = "verbose";

      const result = envSchema.safeParse(process.env);
      expect(result.success).toBe(false);
    });
  });

  describe("Complete valid environment", () => {
    it("should parse complete valid environment", () => {
      process.env.NODE_ENV = "production";
      process.env.PORT = "4000";
      process.env.STRIPE_API_URL = "https://api.stripe.com/v1";
      process.env.LOG_LEVEL = "error";

      const result = envSchema.safeParse(process.env);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          NODE_ENV: "production",
          PORT: 4000,
          STRIPE_API_URL: "https://api.stripe.com/v1",
          LOG_LEVEL: "error",
        });
      }
    });
  });
});
