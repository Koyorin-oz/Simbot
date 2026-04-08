-- CreateTable
CREATE TABLE "MusicPlayHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'youtube',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "MusicPlayHistory_guildId_userId_createdAt_idx" ON "MusicPlayHistory"("guildId", "userId", "createdAt");
