import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  STRIPE_API_URL: z.string().url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  IDEMPOTENCY_TTL_SECONDS: z.string().default('86400').transform(Number),
  RATE_LIMIT_CAPACITY: z.string().default('20').transform(Number),
  RATE_LIMIT_REFILL_PER_SECOND: z.string().default('10').transform(Number),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;