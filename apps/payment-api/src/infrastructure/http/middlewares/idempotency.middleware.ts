import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { IIdempotencyStore } from "../../idempotency/idempotency-store.interface";
import { logger } from "../observability/logger";

const HEADER = "Idempotency-Key";

// Sorted keys so semantically equal bodies hash identically regardless of field order.
function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortDeep(source[key]);
        return acc;
      }, {});
  }
  return value;
}

function hashRequest(body: unknown): string {
  return createHash("sha256").update(stableStringify(body)).digest("hex");
}

export function idempotency(store: IIdempotencyStore) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const key = req.header(HEADER);
    if (!key) {
      next();
      return;
    }

    const requestHash = hashRequest(req.body);
    const result = await store.reserve(key, requestHash);

    if (result.outcome === "existing") {
      const { record } = result;

      if (record.requestHash !== requestHash) {
        res.status(409).json({
          error:
            "Idempotency-Key already used with a different request payload.",
        });
        return;
      }

      if (record.status === "in_progress" || record.response === null) {
        res.setHeader("Retry-After", "1");
        res.status(409).json({
          error:
            "A request with this Idempotency-Key is already being processed.",
        });
        return;
      }

      res.setHeader("Idempotent-Replayed", "true");
      res.status(record.response.statusCode).json(record.response.body);
      return;
    }

    // Persist on success; release on failure so the client can safely retry.
    const sendJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      const statusCode = res.statusCode;
      if (statusCode >= 200 && statusCode < 300) {
        void store
          .complete(key, { statusCode, body })
          .catch((err: unknown) =>
            logger.error({ err, key }, "Failed to persist idempotent response"),
          );
      } else {
        void store
          .release(key)
          .catch((err: unknown) =>
            logger.error(
              { err, key },
              "Failed to release idempotency reservation",
            ),
          );
      }
      return sendJson(body);
    };

    next();
  };
}
