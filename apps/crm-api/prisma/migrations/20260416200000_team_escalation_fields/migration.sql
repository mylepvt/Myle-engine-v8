-- AlterTable
ALTER TABLE "User" ADD COLUMN "teamId" TEXT;

-- AlterTable
ALTER TABLE "Escalation" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "mandatoryReview" BOOLEAN NOT NULL DEFAULT false;
