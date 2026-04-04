-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'general';

-- CreateIndex
CREATE INDEX "Ticket_guildId_ownerId_status_kind_idx" ON "Ticket"("guildId", "ownerId", "status", "kind");
