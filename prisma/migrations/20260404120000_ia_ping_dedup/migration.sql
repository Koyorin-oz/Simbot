-- CreateTable
CREATE TABLE "IaPingDedup" (
    "messageId" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "IaPingDedup_createdAt_idx" ON "IaPingDedup"("createdAt");
