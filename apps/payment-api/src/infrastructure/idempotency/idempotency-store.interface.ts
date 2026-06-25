export interface StoredResponse {
  statusCode: number;
  body: unknown;
}

export interface IdempotencyRecord {
  requestHash: string;
  status: "in_progress" | "completed";
  response: StoredResponse | null;
  createdAt: number;
}

export type ReserveResult =
  | { outcome: "reserved" }
  | { outcome: "existing"; record: IdempotencyRecord };

// Port so the in-memory store can be swapped for a shared backend (Redis) — project.md #1.
export interface IIdempotencyStore {
  // `reserved` means the caller won the slot and must execute; `existing` returns the prior record.
  reserve(key: string, requestHash: string): Promise<ReserveResult>;
  complete(key: string, response: StoredResponse): Promise<void>;
  release(key: string): Promise<void>;
}
