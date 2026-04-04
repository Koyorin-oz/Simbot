const config = require("../config");
const { ensureUser, randomBetween } = require("./economyService");

const COFFEE_COOLDOWN_MS = 10 * 60 * 1000;

async function ensureInventoryTables(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_inventory (
      guildId TEXT NOT NULL,
      userId TEXT NOT NULL,
      coffeeCount INTEGER NOT NULL DEFAULT 0,
      customRoleCount INTEGER NOT NULL DEFAULT 0,
      lastCoffeeUsedAt TEXT,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guildId, userId)
    )
  `);
  await ensureInventoryColumns(prisma);
}

async function ensureInventoryColumns(prisma) {
  const cols = await prisma.$queryRawUnsafe("PRAGMA table_info('user_inventory')");
  const names = new Set((cols || []).map((c) => c.name));
  if (!names.has("customRoleCount")) {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE user_inventory ADD COLUMN customRoleCount INTEGER NOT NULL DEFAULT 0"
    );
  }
}

async function ensureInventoryRow(prisma, guildId, userId) {
  await ensureInventoryTables(prisma);
  await prisma.$executeRaw`
    INSERT INTO user_inventory (guildId, userId, coffeeCount)
    VALUES (${guildId}, ${userId}, 0)
    ON CONFLICT(guildId, userId) DO NOTHING
  `;
}

async function getInventoryRow(prisma, guildId, userId) {
  await ensureInventoryRow(prisma, guildId, userId);
  const rows = await prisma.$queryRaw`
    SELECT guildId, userId, coffeeCount, customRoleCount, lastCoffeeUsedAt
    FROM user_inventory
    WHERE guildId = ${guildId} AND userId = ${userId}
    LIMIT 1
  `;
  return rows[0] || { guildId, userId, coffeeCount: 0, customRoleCount: 0, lastCoffeeUsedAt: null };
}

function getCoffeeCooldownRemainingMs(lastCoffeeUsedAt) {
  if (!lastCoffeeUsedAt) return 0;
  const lastMs = new Date(lastCoffeeUsedAt).getTime();
  const remain = lastMs + COFFEE_COOLDOWN_MS - Date.now();
  return Math.max(0, remain);
}

async function getInventorySnapshot(prisma, guildId, userId) {
  const user = await ensureUser(prisma, guildId, userId);
  const inv = await getInventoryRow(prisma, guildId, userId);
  return {
    user,
    coffeeCount: Number(inv.coffeeCount || 0),
    customRoleCount: Number(inv.customRoleCount || 0),
    coffeeCooldownRemainingMs: getCoffeeCooldownRemainingMs(inv.lastCoffeeUsedAt)
  };
}

async function addCoffeeItem(prisma, guildId, userId, amount = 1) {
  await ensureInventoryRow(prisma, guildId, userId);
  await prisma.$executeRaw`
    UPDATE user_inventory
    SET coffeeCount = coffeeCount + ${amount},
        updatedAt = datetime('now')
    WHERE guildId = ${guildId} AND userId = ${userId}
  `;
  const next = await getInventoryRow(prisma, guildId, userId);
  return Number(next.coffeeCount || 0);
}

async function addCustomRoleItem(prisma, guildId, userId, amount = 1) {
  await ensureInventoryRow(prisma, guildId, userId);
  await prisma.$executeRaw`
    UPDATE user_inventory
    SET customRoleCount = customRoleCount + ${amount},
        updatedAt = datetime('now')
    WHERE guildId = ${guildId} AND userId = ${userId}
  `;
  const next = await getInventoryRow(prisma, guildId, userId);
  return Number(next.customRoleCount || 0);
}

async function consumeCustomRoleItem(prisma, guildId, userId) {
  const inv = await getInventoryRow(prisma, guildId, userId);
  const count = Number(inv.customRoleCount || 0);
  if (count < 1) return { ok: false, error: "Tu n'as pas d'item Role Perso dans ton inventaire." };
  await prisma.$executeRaw`
    UPDATE user_inventory
    SET customRoleCount = customRoleCount - 1,
        updatedAt = datetime('now')
    WHERE guildId = ${guildId} AND userId = ${userId}
  `;
  const next = await getInventoryRow(prisma, guildId, userId);
  return { ok: true, customRoleCount: Number(next.customRoleCount || 0) };
}

async function useCoffeeItem(prisma, guildId, userId) {
  const inv = await getInventoryRow(prisma, guildId, userId);
  const coffeeCount = Number(inv.coffeeCount || 0);
  if (coffeeCount < 1) {
    return { ok: false, error: "Tu n'as pas de cafe dans ton inventaire." };
  }

  const remainingMs = getCoffeeCooldownRemainingMs(inv.lastCoffeeUsedAt);
  if (remainingMs > 0) {
    return { ok: false, error: "cooldown", remainingMs };
  }

  const boost = randomBetween(...config.shop.coffeeBoostRangePct);
  const minutes = randomBetween(...config.shop.coffeeMinutesRange);
  const until = new Date(Date.now() + minutes * 60_000);
  const nowIso = new Date().toISOString();

  await ensureUser(prisma, guildId, userId);
  await prisma.$transaction([
    prisma.user.update({
      where: { userId },
      data: {
        coffeeBoostPct: boost,
        coffeeUntil: until
      }
    }),
    prisma.$executeRaw`
      UPDATE user_inventory
      SET coffeeCount = coffeeCount - 1,
          lastCoffeeUsedAt = ${nowIso},
          updatedAt = datetime('now')
      WHERE guildId = ${guildId} AND userId = ${userId}
    `
  ]);

  const next = await getInventoryRow(prisma, guildId, userId);
  return {
    ok: true,
    boost,
    minutes,
    until,
    coffeeCount: Number(next.coffeeCount || 0)
  };
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min <= 0) return `${sec}s`;
  return `${min}m ${String(sec).padStart(2, "0")}s`;
}

async function resetEconomyForGuild(prisma, guildId) {
  await ensureInventoryTables(prisma);

  const users = await prisma.user.updateMany({
    where: { guildId },
    data: {
      simbaCoins: 0,
      simbaPoints: 0,
      levelPoints: 0,
      level: 1,
      rankKey: "hyene_1",
      crownOwned: false,
      piggyOwned: false,
      coffeeUntil: null,
      coffeeBoostPct: 0,
      customRoleUnlocked: false,
      customRoleId: null
    }
  });

  const claims = await prisma.rewardClaim.updateMany({
    where: { guildId },
    data: { dailyAt: null, weeklyAt: null, monthlyAt: null }
  });

  const itemsReset = await prisma.$executeRaw`
    UPDATE user_inventory
    SET coffeeCount = 0,
        customRoleCount = 0,
        lastCoffeeUsedAt = NULL,
        updatedAt = datetime('now')
    WHERE guildId = ${guildId}
  `;

  return {
    users: users.count,
    claims: claims.count,
    itemsReset: Number(itemsReset || 0)
  };
}

module.exports = {
  COFFEE_COOLDOWN_MS,
  ensureInventoryTables,
  getInventorySnapshot,
  addCoffeeItem,
  addCustomRoleItem,
  consumeCustomRoleItem,
  useCoffeeItem,
  formatDuration,
  resetEconomyForGuild
};
