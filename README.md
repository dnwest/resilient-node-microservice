# 🛡️ Resilient Node.js Microservice Architecture

![Node.js](https://img.shields.io/badge/Node.js-22.x-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Turborepo](https://img.shields.io/badge/Turborepo-Monorepo-red)
![Docker](https://img.shields.io/badge/Docker-Multi--stage-2496ED)
![CI](https://github.com/dnwest/resilient-node-microservice/actions/workflows/ci.yml/badge.svg)
![Test Coverage](https://img.shields.io/badge/Coverage-70%25-yellow)
![Tests](https://img.shields.io/badge/Tests-40%20passing-success)
![ESLint](https://img.shields.io/badge/ESLint-Passing-4B32C3)

An enterprise-grade, production-ready microservice demonstrating advanced resilience patterns, observability, and modern Developer Experience (DX).

---

## 🎯 The Problem & The Solution

In distributed systems, external dependencies (like Payment Gateways or third-party APIs) will inevitably fail. This repository demonstrates how to build a Node.js microservice that **survives network partitions and external outages** without cascading failures.

---

## 🏗️ Architecture Overview

```text
                ┌───────────────┐
                │   Client App  │
                └───────┬───────┘
                        │ HTTPS
                        ▼
                ┌──────────────────┐
                │   AWS ALB        │
                │   (HTTPS/HTTP)   │
                └────────┬─────────┘
                         │
                         ▼
                ┌──────────────────┐
                │  AWS ECS Fargate │
                │  (Auto-scaling)  │
                └────────┬─────────┘
                         │
                         ▼
                ┌──────────────────┐
                │   Payment API    │
                │     (Express)    │
                └────────┬─────────┘
                         │
                         ▼
                ┌──────────────────┐
                │  Circuit Breaker │
                │    (Opossum)     │
                └────────┬─────────┘
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
    ┌────────────────┐     ┌─────────────────┐
    │ External API   │     │ Fallback (503)  │
    │ (Stripe/etc)   │     │ Fail-Fast       │
    └────────────────┘     └─────────────────┘
```

---

## ☁️ Cloud Architecture (AWS)

Infrastructure provisioned with **Terraform** for reproducibility and GitOps.

```text
┌───────────────────────────────────────────────────────────────────┐
│                         AWS Cloud                                 │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                     VPC (10.0.0.0/16)                      │   │
│  │                                                            │   │
│  │   ┌───────────────┐         ┌─────────────────────────┐    │   │
│  │   │ Public Subnet │         │    Public Subnet        │    │   │
│  │   │   (AZ-1)      │         │      (AZ-2)             │    │   │
│  │   └──────┬────────┘         └────────────┬────────────┘    │   │
│  │          │                               │                 │   │
│  │          └──────────────┬────────────────┘                 │   │
│  │                         │                                  │   │
│  │                         ▼                                  │   │
│  │   ┌───────────────────────────────────────────────────┐    │   │
│  │   │              Application Load Balancer            │    │   │
│  │   │  HTTPS:443 (ACM) │ HTTP:80 (→ HTTPS redirect)     │    │   │
│  │   └──────────────────────────┬────────────────────────┘    │   │
│  │                              │                             │   │
│  │   ┌──────────────────────────┴─────────────────────────┐   │   │
│  │   │              ECS Fargate Service                   │   │   │
│  │   │         Desired Count: 2 │ Auto-scaling            │   │   │
│  │   │  ┌─────────────┐  ┌─────────────┐                  │   │   │
│  │   │  │  Task #1    │  │  Task #2    │                  │   │   │
│  │   │  │  :3000      │  │  :3000      │                  │   │   │
│  │   │  └─────────────┘  └─────────────┘                  │   │   │
│  │   └────────────────────────────────────────────────────┘   │   │
│  │                              │                             │   │
│  │                              ▼                             │   │
│  │   ┌────────────────────────────────────────────────────┐   │   │
│  │   │              CloudWatch Logs                       │   │   │
│  │   │              /ecs/payment-api                      │   │   │
│  │   └────────────────────────────────────────────────────┘   │   │
│  └────────────────────────────────────────────────────────────┘   │
│                              │                                    │
│                              ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                      ECR Repository                        │   │
│  │                   node-microservice                        │   │
│  └────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

### Terraform Structure

```
infrastructure/terraform/
├── environments/
│   ├── dev/                    # Development environment
│   │   └── main.tf
│   └── prod/                   # Production environment
├── modules/
│   ├── vpc/                    # VPC with public subnets
│   ├── ecr/                    # ECR repository
│   ├── ecs/                    # ECS Fargate cluster & service
│   └── alb/                    # Application Load Balancer
├── main.tf                     # Provider configuration
├── variables.tf
└── outputs.tf
```

---

## 📦 Tech Stack

| Layer            | Technology       | Purpose                   |
| ---------------- | ---------------- | ------------------------- |
| Runtime          | Node.js 20       | JavaScript runtime        |
| Language         | TypeScript 5     | Type safety               |
| Framework        | Express 5        | HTTP server               |
| Resilience       | Opossum          | Circuit Breaker pattern   |
| Validation       | Zod 4            | Runtime schema validation |
| Logging          | Pino             | Structured JSON logging   |
| Monorepo         | pnpm + Turborepo | Build orchestration       |
| Containerization | Docker           | Multi-stage builds        |
| Load Testing     | k6               | Performance validation    |
| IaC              | Terraform        | Infrastructure as Code    |
| CI/CD            | GitHub Actions   | Automation                |

---

## 🔄 Request Flow

1. Client sends HTTPS request to **ALB DNS**
2. ALB terminates SSL and routes to **ECS Fargate** tasks
3. Express receives request → validates with **Zod**
4. **Circuit Breaker** checks external Payment Provider status
5. If provider healthy: Forward request, return `200 OK`
6. If provider failing: Return `503` immediately (fail-fast)
7. Response logged to **CloudWatch** with correlation ID

---

## 🛡️ Resilience Strategy

### Circuit Breaker (Opossum)

```
CLOSED ──[50% errors]──► OPEN
   ▲                         │
   │                         │ [10s timeout]
   │                         ▼
   └──────[success]───── HALF-OPEN
```

| State         | Behavior                                |
| ------------- | --------------------------------------- |
| **CLOSED**    | Normal operation, requests pass through |
| **OPEN**      | All requests fail-fast, return 503      |
| **HALF-OPEN** | Testing recovery, limited requests      |

### Fail-Fast Configuration

Zod validates environment at startup:

```typescript
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.string().transform(Number),
  STRIPE_API_URL: z.string().url(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]),
});
```

### Graceful Shutdown

- `SIGTERM` / `SIGINT` handlers
- Drain HTTP connections before exit
- Zero-downtime deployments

---

## 📊 Observability

### Structured Logging (Pino)

```json
{
  "level": 30,
  "time": "2026-03-26T12:00:00.000Z",
  "pid": 1234,
  "hostname": "ecs-task",
  "msg": "Payment processed",
  "requestId": "req-abc123",
  "amount": 1000,
  "currency": "usd",
  "duration": 45
}
```

### PII Redaction

Automatically redacts sensitive fields:

- `authorization`
- `creditCardNumber`
- `password`

---

## 🏗️ Project Structure

```
.
├── apps/
│   └── payment-api/
│       ├── src/
│       │   ├── config/          # Environment validation
│       │   ├── domain/          # Business entities
│       │   ├── application/     # Use cases
│       │   └── infrastructure/  # External integrations
│       │       └── http/
│       │           ├── providers/      # Stripe provider (Circuit Breaker)
│       │           ├── middlewares/    # Error handler, rate limiter
│       │           └── observability/  # Pino logger
│       └── tests/
│           └── load-test.js     # k6 load test
├── infrastructure/
│   └── terraform/              # AWS infrastructure
├── .github/
│   └── workflows/
│       └── ci.yml             # CI/CD pipeline
├── .eslintrc.json             # ESLint configuration
├── turbo.json                 # Turborepo config
└── pnpm-workspace.yaml        # pnpm workspaces
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js >= 20.x
- pnpm >= 9.x
- Docker (optional)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/dnwest/resilient-node-microservice.git
cd resilient-node-microservice

# Install dependencies
pnpm install

# Copy environment file
cp apps/payment-api/.env.example apps/payment-api/.env

# Start development server
pnpm dev

# Run tests
pnpm test

# Run linter
pnpm lint
```

### Environment Variables

```bash
# apps/payment-api/.env
NODE_ENV=development
PORT=3000
STRIPE_API_URL=https://api.stripe.com/v1
LOG_LEVEL=debug
```

---

## 🧪 Testing

### Unit & Integration Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage
cd apps/payment-api && pnpm test
```

**Coverage Areas:**

- Circuit Breaker logic (states, fallback, events)
- Zod schema validation
- Pino logger (structured logging, PII redaction)

### Load Testing (k6)

```bash
# Start the API
pnpm dev

# In another terminal, run k6
cd apps/payment-api
pnpm test:load
```

Expected results:

- `200 OK` when circuit is CLOSED
- `503 Service Unavailable` when circuit is OPEN

---

## 🐳 Docker

### Build & Run

```bash
# Build production image
docker build -t payment-api:production -f apps/payment-api/Dockerfile .

# Run container
docker run -p 3000:3000 \
  --env-file apps/payment-api/.env \
  payment-api:production
```

### Docker Compose (Development)

```bash
docker compose up --build
```

---

## 🚢 Deployment

### Terraform (AWS)

```bash
cd infrastructure/terraform/environments/dev

# Initialize Terraform
terraform init

# Plan changes
terraform plan

# Apply infrastructure
terraform apply
```

**Note:** Update `certificate_arn` in `dev/main.tf` with your ACM certificate.

### ECS Deployment

```bash
# Build and push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
docker build -t $ECR_REGISTRY/node-microservice:latest .
docker push $ECR_REGISTRY/node-microservice:latest

# Update ECS service (triggers rolling deployment)
aws ecs update-service --cluster microservices-cluster --service node-service --force-new-deployment
```

---

## 🔧 Development Workflow

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes and test
pnpm test
pnpm lint

# 3. Commit (conventional commits)
git commit -m "feat(provider): add retry logic"

# 4. Push and create PR
git push origin feature/my-feature
```

### Commit Convention

| Type       | Description      |
| ---------- | ---------------- |
| `feat`     | New feature      |
| `fix`      | Bug fix          |
| `test`     | Tests            |
| `ci`       | CI/CD            |
| `docs`     | Documentation    |
| `refactor` | Code refactoring |
| `chore`    | Maintenance      |

---

## 📈 Future Improvements

- [ ] Retry with exponential backoff
- [ ] Distributed tracing (OpenTelemetry)
- [ ] Prometheus metrics endpoint
- [ ] Rate limiting middleware
- [ ] Database integration (PostgreSQL)
- [ ] Redis for distributed caching
- [ ] Blue/Green deployments
- [ ] AWS CodePipeline integration

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

## 👨‍💻 Author

**Cristian Fernandes**  
Senior Software Engineer
