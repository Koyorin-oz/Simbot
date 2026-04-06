-- Auto-modération : réglages par serveur + listes par catégorie.

CREATE TABLE "AutoModGuild" (
    "guildId" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "AutoModCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "words" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "AutoModCategory_guildId_idx" ON "AutoModCategory"("guildId");
