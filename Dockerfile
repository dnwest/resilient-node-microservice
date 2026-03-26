# --- Stage 1: Install all dependencies ---
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat bash
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV SHELL=/bin/bash
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- Stage 2: Builder ---
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat bash
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV SHELL=/bin/bash
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

COPY package.json pnpm-lock.yaml ./
COPY apps/payment-api/package.json ./apps/payment-api/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm turbo run build --filter=payment-api...

# --- Stage 3: Runner (Production Image) ---
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs
USER expressjs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/payment-api/dist ./dist
COPY --from=builder /app/apps/payment-api/package.json ./package.json

CMD ["node", "dist/infrastructure/http/server.js"]
