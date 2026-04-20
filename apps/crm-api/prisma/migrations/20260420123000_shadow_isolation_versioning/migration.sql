ALTER TABLE "Lead"
  ADD COLUMN "isShadow" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legacyVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "legacyIdempotencyKey" TEXT,
  ADD COLUMN "legacyDeletedAt" TIMESTAMP(3);

UPDATE "Lead"
SET "isShadow" = true
WHERE "ownerId" = 'legacy-shadow';

DROP INDEX IF EXISTS "Lead_pipelineKind_inPool_idx";
DROP INDEX IF EXISTS "Lead_handlerId_lastActivityAt_idx";
DROP INDEX IF EXISTS "Lead_ownerId_idx";

CREATE INDEX "Lead_pipelineKind_inPool_isShadow_idx" ON "Lead"("pipelineKind", "inPool", "isShadow");
CREATE INDEX "Lead_handlerId_lastActivityAt_isShadow_idx" ON "Lead"("handlerId", "lastActivityAt", "isShadow");
CREATE INDEX "Lead_ownerId_isShadow_idx" ON "Lead"("ownerId", "isShadow");
CREATE INDEX "Lead_isShadow_legacyVersion_idx" ON "Lead"("isShadow", "legacyVersion");
