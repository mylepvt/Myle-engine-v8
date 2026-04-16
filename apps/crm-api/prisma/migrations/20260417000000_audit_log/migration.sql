-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "leadId" TEXT,
    "actorId" TEXT,
    "targetUserId" TEXT,
    "amountCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "idempotencyKey" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_idempotencyKey_key" ON "AuditLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AuditLog_leadId_createdAt_idx" ON "AuditLog"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
