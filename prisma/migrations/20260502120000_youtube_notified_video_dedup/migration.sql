-- CreateTable
CREATE TABLE "YouTubeNotifiedVideo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceKey" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "YouTubeNotifiedVideo_sourceKey_videoId_key" ON "YouTubeNotifiedVideo"("sourceKey", "videoId");

-- CreateIndex
CREATE INDEX "YouTubeNotifiedVideo_sourceKey_createdAt_idx" ON "YouTubeNotifiedVideo"("sourceKey", "createdAt");
