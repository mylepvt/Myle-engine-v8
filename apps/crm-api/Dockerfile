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
COPY --from=builder /repo/apps/crm-api/prisma ./prisma

EXPOSE 4000

CMD ["/bin/sh", "-c", "\
  npx prisma migrate resolve --applied 20260416000000_init 2>/dev/null || true && \
  npx prisma migrate resolve --applied 20260416120000_alive_flags 2>/dev/null || true && \
  npx prisma migrate resolve --applied 20260416200000_team_escalation_fields 2>/dev/null || true && \
  npx prisma migrate resolve --applied 20260417000000_audit_log 2>/dev/null || true && \
  npx prisma migrate resolve --applied 20260417120000_lead_escalation_level 2>/dev/null || true && \
  npx prisma migrate resolve --applied 20260418000000_lead_legacy_id 2>/dev/null || true && \
  npx prisma migrate resolve --applied 20260418120000_legacy_lead_view 2>/dev/null || true && \
  npx prisma migrate deploy && node dist/index.js"]
