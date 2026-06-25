import type { Redis } from "ioredis";
import type {
  IIdempotencyStore,
  IdempotencyRecord,
  ReserveResult,
  StoredResponse,
} from "./idempotency-store.interface";

// Atomic get-or-create: returns the existing record JSON, or sets the initial
// in-progress record and returns nil (this caller wins the slot).
const RESERVE_LUA = `
local existing = redis.call('GET', KEYS[1])
if existing then return existing end
redis.call('SET', KEYS[1], ARGV[1], 'PX', tonumber(ARGV[2]))
return nil
`;

// Merge the final response into the reserved record (preserving requestHash),
// only if the reservation still exists — mirroring the in-memory no-op semantics.
const COMPLETE_LUA = `
local existing = redis.call('GET', KEYS[1])
if not existing then return nil end
local record = cjson.decode(existing)
record.status = 'completed'
record.response = cjson.decode(ARGV[1])
record.createdAt = tonumber(ARGV[2])
redis.call('SET', KEYS[1], cjson.encode(record), 'PX', tonumber(ARGV[3]))
return nil
`;

/**
 * Distributed idempotency store backed by Redis, so de-duplication holds across
 * every instance behind the load balancer. Atomicity of the reserve check-and-set
 * is guaranteed by a Lua script (Redis executes it without interleaving).
 */
export class RedisIdempotencyStore implements IIdempotencyStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlMs: number,
    private readonly keyPrefix = "idem:",
  ) {}

  async reserve(key: string, requestHash: string): Promise<ReserveResult> {
    const record: IdempotencyRecord = {
      requestHash,
      status: "in_progress",
      response: null,
      createdAt: Date.now(),
    };

    const existing = (await this.redis.eval(
      RESERVE_LUA,
      1,
      this.namespaced(key),
      JSON.stringify(record),
      this.ttlMs,
    )) as string | null;

    if (existing === null) {
      return { outcome: "reserved" };
    }
    return { outcome: "existing", record: JSON.parse(existing) };
  }

  async complete(key: string, response: StoredResponse): Promise<void> {
    await this.redis.eval(
      COMPLETE_LUA,
      1,
      this.namespaced(key),
      JSON.stringify(response),
      Date.now(),
      this.ttlMs,
    );
  }

  async release(key: string): Promise<void> {
    await this.redis.del(this.namespaced(key));
  }

  private namespaced(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
}
