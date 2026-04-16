# Build context: repo root (docker-compose/render uses context: .)
FROM node:22-bookworm-slim AS builder

WORKDIR /repo

# Root workspace files for layer caching
COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/crm-api/package.json ./apps/crm-api/

RUN npm ci --no-audit --no-fund

WORKDIR /repo/apps/crm-api

COPY apps/crm-api/prisma ./prisma
RUN npx prisma generate

COPY apps/crm-api/ .
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

# Copy hoisted node_modules + workspace node_modules
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/crm-api/dist ./dist
COPY --from=builder /repo/apps/crm-api/node_modules ./node_modules_ws
# Merge workspace node_modules (they override hoisted ones)
RUN cp -rn ./node_modules_ws/. ./node_modules/ 2>/dev/null || true && rm -rf ./node_modules_ws
COPY --from=builder /repo/apps/crm-api/prisma ./prisma

EXPOSE 4000

CMD ["/bin/sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
