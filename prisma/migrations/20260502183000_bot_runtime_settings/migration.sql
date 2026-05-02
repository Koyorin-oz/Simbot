-- CreateTable
CREATE TABLE "BotRuntimeSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "presenceActivityType" TEXT NOT NULL DEFAULT 'WATCHING',
    "presenceActivityName" TEXT NOT NULL DEFAULT 'SimBot',
    "presenceStatus" TEXT NOT NULL DEFAULT 'online',
    "presenceStreamUrl" TEXT NOT NULL DEFAULT '',
    "embedTitle" TEXT NOT NULL DEFAULT '',
    "embedDescription" TEXT NOT NULL DEFAULT '',
    "embedAuthorName" TEXT NOT NULL DEFAULT '',
    "embedAuthorIconUrl" TEXT NOT NULL DEFAULT '',
    "embedFooterText" TEXT NOT NULL DEFAULT '',
    "embedFooterIconUrl" TEXT NOT NULL DEFAULT '',
    "embedImageUrl" TEXT NOT NULL DEFAULT '',
    "embedThumbnailUrl" TEXT NOT NULL DEFAULT '',
    "embedColor" INTEGER NOT NULL DEFAULT 5793266,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "BotRuntimeSettings" ("id", "presenceActivityType", "presenceActivityName", "presenceStatus", "presenceStreamUrl", "embedTitle", "embedDescription", "embedAuthorName", "embedAuthorIconUrl", "embedFooterText", "embedFooterIconUrl", "embedImageUrl", "embedThumbnailUrl", "embedColor", "updatedAt")
VALUES (1, 'WATCHING', 'SimBot', 'online', '', '', '', '', '', '', '', '', '', 5793266, CURRENT_TIMESTAMP);
