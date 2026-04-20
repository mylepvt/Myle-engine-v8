ALTER TABLE "Lead"
  ADD COLUMN "legacyStatus" TEXT,
  ADD COLUMN "legacyWhatsappSentAt" TIMESTAMP(3),
  ADD COLUMN "legacyPaymentStatus" TEXT,
  ADD COLUMN "legacyMindsetLockState" TEXT,
  ADD COLUMN "legacyMindsetStartedAt" TIMESTAMP(3),
  ADD COLUMN "legacyMindsetCompletedAt" TIMESTAMP(3),
  ADD COLUMN "legacyDay1CompletedAt" TIMESTAMP(3),
  ADD COLUMN "legacyDay2CompletedAt" TIMESTAMP(3),
  ADD COLUMN "legacyDay3CompletedAt" TIMESTAMP(3),
  ADD COLUMN "legacySyncedAt" TIMESTAMP(3);
