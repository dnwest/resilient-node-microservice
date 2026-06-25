import { describe, it, expect, vi } from "vitest";
import { AxiosError } from "axios";
import { withRetry, isRetryableGatewayError } from "./with-retry";

const noSleep = () => Promise.resolve();

describe("withRetry", () => {
  it("returns immediately on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withRetry(fn, {
      retries: 3,
      baseDelayMs: 10,
      isRetryable: () => true,
      sleep: noSleep,
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries up to the limit then resolves on a later success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, {
      retries: 2,
      baseDelayMs: 10,
      isRetryable: () => true,
      sleep: noSleep,
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    await expect(
      withRetry(fn, {
        retries: 2,
        baseDelayMs: 10,
        isRetryable: () => true,
        sleep: noSleep,
      }),
    ).rejects.toThrow("always fails");

    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("does not retry when the error is not retryable", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent"));

    await expect(
      withRetry(fn, {
        retries: 3,
        baseDelayMs: 10,
        isRetryable: () => false,
        sleep: noSleep,
      }),
    ).rejects.toThrow("permanent");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("applies exponential backoff between attempts", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("e"))
      .mockRejectedValueOnce(new Error("e"))
      .mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await withRetry(fn, {
      retries: 3,
      baseDelayMs: 100,
      isRetryable: () => true,
      sleep,
    });

    expect(sleep).toHaveBeenNthCalledWith(1, 100); // 100 * 2^0
    expect(sleep).toHaveBeenNthCalledWith(2, 200); // 100 * 2^1
  });

  it("notifies onRetry with the attempt number", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("e"))
      .mockResolvedValue("ok");
    const onRetry = vi.fn();

    await withRetry(fn, {
      retries: 2,
      baseDelayMs: 10,
      isRetryable: () => true,
      onRetry,
      sleep: noSleep,
    });

    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });
});

describe("isRetryableGatewayError", () => {
  function axiosErrorWithStatus(status?: number): AxiosError {
    const error = new AxiosError("request failed");
    if (status !== undefined) {
      error.response = { status } as AxiosError["response"];
    }
    return error;
  }

  it("retries network errors with no response", () => {
    expect(isRetryableGatewayError(axiosErrorWithStatus(undefined))).toBe(true);
  });

  it("retries on 5xx", () => {
    expect(isRetryableGatewayError(axiosErrorWithStatus(500))).toBe(true);
    expect(isRetryableGatewayError(axiosErrorWithStatus(503))).toBe(true);
  });

  it("retries on 429", () => {
    expect(isRetryableGatewayError(axiosErrorWithStatus(429))).toBe(true);
  });

  it("does not retry on other 4xx", () => {
    expect(isRetryableGatewayError(axiosErrorWithStatus(400))).toBe(false);
    expect(isRetryableGatewayError(axiosErrorWithStatus(404))).toBe(false);
  });

  it("does not retry non-axios errors", () => {
    expect(isRetryableGatewayError(new Error("boom"))).toBe(false);
  });
});
