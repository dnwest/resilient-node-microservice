# Resilient Node.js Microservice

![Node.js](https://img.shields.io/badge/Node.js-22.x-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Tests](https://img.shields.io/badge/Tests-101%20passing-success)
![ESLint](https://img.shields.io/badge/ESLint-Passing-4B32C3)
![CI](https://github.com/dnwest/resilient-node-microservice/actions/workflows/ci.yml/badge.svg)

Production-ready microservice demonstrating resilience patterns (Circuit Breaker), structured logging, and graceful shutdown.

## Architecture

```
Client → ALB → ECS Fargate → Express (Zod validation)
                                ↓
                         Circuit Breaker
                         (Opossum)
                           ↓       ↓
                     Stripe API   503 Fallback
```

## Tech Stack

| Layer      | Technology       |
| ---------- | ---------------- |
| Runtime    | Node.js 22       |
| Language   | TypeScript 5     |
| Framework  | Express 5        |
| Resilience | Opossum (CB)     |
| Validation | Zod 4            |
| Logging    | Pino             |
| Monorepo   | pnpm + Turborepo |
| Container  | Docker           |
| IaC        | Terraform        |
| CI/CD      | GitHub Actions   |

## Resilience Patterns

### Circuit Breaker (Opossum)

```
CLOSED ──[50% errors]──► OPEN ──[10s]──► HALF-OPEN ──[success]──► CLOSED
```

| State     | Behavior              |
| --------- | --------------------- |
| CLOSED    | Normal operation      |
| OPEN      | Fail-fast, return 503 |
| HALF-OPEN | Test recovery         |

### Graceful Shutdown

- SIGTERM/SIGINT handlers
- Connection draining
- Zero-downtime deployments

### Idempotency

Send an `Idempotency-Key` header on `POST /api/v1/payments` to make client
retries safe (no double-charging):

```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 5f3b...c9" \
  -d '{"amount": 1000, "currency": "usd"}'
```

| Scenario                            | Behavior                                      |
| ----------------------------------- | --------------------------------------------- |
| Same key + same body                | Replays stored response (`Idempotent-Replayed: true`), no second gateway call |
| Same key + different body           | `409 Conflict`                                |
| Same key while first is in flight   | `409 Conflict` + `Retry-After`                |
| Failed attempt (non-2xx)            | Key released so the client can safely retry   |

> Backed by an in-memory store keyed for **single-instance** correctness today,
> behind the `IIdempotencyStore` port. Sharing it across instances (Redis) is
> tracked in the roadmap (#1/#2).

### Rate Limiting (Token Bucket)

`POST /api/v1/payments` is protected by a token-bucket limiter keyed by client
IP. Each client gets a bucket of `RATE_LIMIT_CAPACITY` tokens (the burst) that
refills at `RATE_LIMIT_REFILL_PER_SECOND` (the sustained rate):

```
capacity (burst) ──drains per request──► 0 ──refills at N/sec──► capacity
```

| Outcome   | Response                                                         |
| --------- | ---------------------------------------------------------------- |
| Allowed   | `X-RateLimit-Limit` / `X-RateLimit-Remaining` headers, proceeds  |
| Throttled | `429 Too Many Requests` + `Retry-After`                          |

> Runs behind ALB with `trust proxy` enabled so the bucket keys on the real
> client IP. The bucket state is in-memory, so the limit holds **per instance**;
> a shared (Redis + Lua) backend behind the `IRateLimiterStore` port makes it
> consistent across instances — roadmap #1/#2.

## Quick Start

```bash
git clone https://github.com/dnwest/resilient-node-microservice.git
cd resilient-node-microservice
pnpm install
cp apps/payment-api/.env.example apps/payment-api/.env
pnpm dev
```

## Environment Variables

```bash
NODE_ENV=development
PORT=3000
STRIPE_API_URL=https://api.stripe.com/v1
LOG_LEVEL=info
```

## Commands

```bash
pnpm test          # Run tests
pnpm lint          # Run linter
pnpm build         # Build for production
pnpm dev           # Development server
```

## Testing

77 unit tests covering:

- Circuit Breaker states & transitions
- Zod schema validation
- Pino structured logging
- Health check & graceful shutdown

## Docker

```bash
# Build
docker build -t payment-api .

# Run
docker run -p 3000:3000 --env-file apps/payment-api/.env payment-api
```

## Deployment (AWS)

```bash
cd infrastructure/terraform/environments/dev
terraform init
terraform apply
```

## CI/CD

GitHub Actions pipeline: lint → test → build → docker → hadolint

## Project Structure

```
apps/payment-api/src/
├── config/              # Environment validation (Zod)
├── domain/              # Business entities
├── application/         # Use cases & schemas
└── infrastructure/
    ├── idempotency/     # IIdempotencyStore port + in-memory impl
    ├── rate-limiting/   # IRateLimiterStore port + token-bucket impl
    └── http/
        ├── providers/       # Stripe with Circuit Breaker
        ├── middlewares/     # Error handler, idempotency, rate limiter
        └── observability/   # Pino logger
```

## Roadmap

The core resilience stack above — Circuit Breaker, graceful shutdown, rate limiting,
Terraform (VPC/ECS/ECR/ALB), CI, and 77 passing tests — is implemented and verifiable
today. Planned enhancements (reflected as the **target state** in the extended
architecture diagram; **not yet wired**):

- [x] **Token-bucket rate limiting** — real burst + refill algorithm with `429`/`Retry-After` _(in-memory, single-instance; Redis-backed distribution pending #1)_
- [x] **Idempotency keys** — safe client retries without double-charging _(in-memory, single-instance; distributed store pending #1)_
- [ ] **Persistence** — MongoDB for payment records and auditability
- [ ] **Deeper readiness probe** — verify downstream dependencies, not just liveness
- [ ] **Exported metrics** — request rate, latency, breaker state, rate-limit rejections

## License

MIT - See [LICENSE](LICENSE)
