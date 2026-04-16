-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "aliveWarnedAt" TIMESTAMP(3),
ADD COLUMN     "aliveLeaderNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "aliveAdminEscalatedAt" TIMESTAMP(3);
