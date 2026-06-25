import axios from "axios";

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  isRetryable: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === options.retries || !options.isRetryable(error)) {
        throw error;
      }
      options.onRetry?.(attempt + 1, error);
      await sleep(options.baseDelayMs * 2 ** attempt);
    }
  }

  throw lastError;
}

// Retry only on transient failures: no response (network/timeout), 5xx, or 429.
// Client errors (other 4xx) are deterministic and must not be retried.
export function isRetryableGatewayError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;

  const status = error.response?.status;
  if (status === undefined) return true;

  return status >= 500 || status === 429;
}
