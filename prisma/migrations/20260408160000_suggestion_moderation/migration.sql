-- AlterTable
ALTER TABLE "Suggestion" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "Suggestion" ADD COLUMN "moderatedAt" DATETIME;
ALTER TABLE "Suggestion" ADD COLUMN "moderatedById" TEXT;
ALTER TABLE "Suggestion" ADD COLUMN "moderationReason" TEXT;
ALTER TABLE "Suggestion" ADD COLUMN "snapshotPour" INTEGER;
ALTER TABLE "Suggestion" ADD COLUMN "snapshotNeutral" INTEGER;
ALTER TABLE "Suggestion" ADD COLUMN "snapshotContre" INTEGER;
