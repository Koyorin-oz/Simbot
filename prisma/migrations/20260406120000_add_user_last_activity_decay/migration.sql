-- Colonnes attendues par le client Prisma (schema.prisma) mais absentes des migrations initiales.

ALTER TABLE "User" ADD COLUMN "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "User" ADD COLUMN "lastSpDecayAt" DATETIME;
