-- Add legacyId bridge field to Lead model
-- Links CRM leads to FastAPI leads.id (INT PK) for proxy routing.
-- Nullable: existing CRM-native leads remain unaffected.
ALTER TABLE "Lead" ADD COLUMN "legacyId" INTEGER;
CREATE UNIQUE INDEX "Lead_legacyId_key" ON "Lead"("legacyId");
