-- Salons ou l'auto-mod (mots + filtre liens) ne s'applique pas.
ALTER TABLE "AutoModGuild" ADD COLUMN "ignoredChannelIds" TEXT NOT NULL DEFAULT '[]';
