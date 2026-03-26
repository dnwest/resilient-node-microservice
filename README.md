# Resilient Node.js Microservice

![Node.js](https://img.shields.io/badge/Node.js-22.x-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Tests](https://img.shields.io/badge/Tests-77%20passing-success)
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
└── infrastructure/http/
    ├── providers/       # Stripe with Circuit Breaker
    ├── middlewares/     # Error handler
    └── observability/   # Pino logger
```

## License

MIT - See [LICENSE](LICENSE)
