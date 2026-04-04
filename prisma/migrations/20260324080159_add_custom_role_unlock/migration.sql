-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "simbaCoins" INTEGER NOT NULL DEFAULT 0,
    "simbaPoints" INTEGER NOT NULL DEFAULT 0,
    "levelPoints" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "rankKey" TEXT NOT NULL DEFAULT 'fer_1',
    "crownOwned" BOOLEAN NOT NULL DEFAULT false,
    "piggyOwned" BOOLEAN NOT NULL DEFAULT false,
    "coffeeUntil" DATETIME,
    "coffeeBoostPct" INTEGER NOT NULL DEFAULT 0,
    "customRoleUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "customRoleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("coffeeBoostPct", "coffeeUntil", "createdAt", "crownOwned", "guildId", "id", "level", "levelPoints", "piggyOwned", "rankKey", "simbaCoins", "simbaPoints", "updatedAt", "userId") SELECT "coffeeBoostPct", "coffeeUntil", "createdAt", "crownOwned", "guildId", "id", "level", "levelPoints", "piggyOwned", "rankKey", "simbaCoins", "simbaPoints", "updatedAt", "userId" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_userId_key" ON "User"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
