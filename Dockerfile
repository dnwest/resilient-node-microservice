# --- Stage 1: Prune (Extract only the necessary workspace packages) ---
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat bash
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV SHELL=/bin/bash
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

COPY . .
# This extracts only the payment-api and its internal dependencies
RUN pnpm turbo prune payment-api --docker

# --- Stage 2: Installer (Install dependencies) ---
FROM node:20-alpine AS installer
RUN apk add --no-cache libc6-compat bash
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV SHELL=/bin/bash
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# First install the dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Build the project
COPY --from=builder /app/out/full/ .
RUN pnpm turbo run build --filter=payment-api...

# --- Stage 3: Runner (Production Image) ---
FROM node:20-alpine AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs
USER expressjs

COPY --from=installer /app/apps/payment-api/package.json .

# Automatically leverage output traces to reduce image size
COPY --from=installer --chown=expressjs:nodejs /app/apps/payment-api/dist ./apps/payment-api/dist
COPY --from=installer --chown=expressjs:nodejs /app/node_modules ./node_modules
COPY --from=installer --chown=expressjs:nodejs /app/apps/payment-api/node_modules ./apps/payment-api/node_modules

CMD ["node", "apps/payment-api/dist/infrastructure/http/server.js"]
