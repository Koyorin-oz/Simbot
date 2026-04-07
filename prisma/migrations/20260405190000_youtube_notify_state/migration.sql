-- Table pour derniere video vue par chaine YouTube (cle = channelId UC...).
CREATE TABLE "YouTubeNotifyState" (
    "sourceKey" TEXT NOT NULL PRIMARY KEY,
    "lastVideoId" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
