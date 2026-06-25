import type {
  IIdempotencyStore,
  IdempotencyRecord,
  ReserveResult,
  StoredResponse,
} from "./idempotency-store.interface";

// Single-process store; the event loop makes reserve's check-and-set atomic.
// De-dup holds per instance until the shared Redis backend lands (project.md #1).
export class InMemoryIdempotencyStore implements IIdempotencyStore {
  private readonly store = new Map<string, IdempotencyRecord>();
  private readonly sweeper: ReturnType<typeof setInterval>;

  constructor(
    private readonly ttlMs: number,
    sweepIntervalMs = 60_000,
  ) {
    this.sweeper = setInterval(() => this.sweep(), sweepIntervalMs);
    this.sweeper.unref();
  }

  async reserve(key: string, requestHash: string): Promise<ReserveResult> {
    this.evictIfExpired(key);

    const existing = this.store.get(key);
    if (existing) {
      return { outcome: "existing", record: existing };
    }

    this.store.set(key, {
      requestHash,
      status: "in_progress",
      response: null,
      createdAt: Date.now(),
    });
    return { outcome: "reserved" };
  }

  async complete(key: string, response: StoredResponse): Promise<void> {
    const record = this.store.get(key);
    if (!record) return;

    record.status = "completed";
    record.response = response;
    record.createdAt = Date.now();
  }

  async release(key: string): Promise<void> {
    this.store.delete(key);
  }

  stop(): void {
    clearInterval(this.sweeper);
  }

  private isExpired(record: IdempotencyRecord): boolean {
    return Date.now() - record.createdAt > this.ttlMs;
  }

  private evictIfExpired(key: string): void {
    const record = this.store.get(key);
    if (record && this.isExpired(record)) {
      this.store.delete(key);
    }
  }

  private sweep(): void {
    for (const [key, record] of this.store) {
      if (this.isExpired(record)) {
        this.store.delete(key);
      }
    }
  }
}
