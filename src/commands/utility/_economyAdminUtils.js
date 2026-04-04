const { ensureUser, getLpNeeded, getRankFromSp } = require("../../services/economyService");
const INT32_MAX = 2_147_483_647;

function clampInt32(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(INT32_MAX, Math.floor(n)));
}

async function addSC(prisma, guildId, userId, amount) {
  const user = await ensureUser(prisma, guildId, userId);
  const next = clampInt32(user.simbaCoins + amount);
  return prisma.user.update({
    where: { userId },
    data: { simbaCoins: next }
  });
}

async function removeSC(prisma, guildId, userId, amount) {
  const user = await ensureUser(prisma, guildId, userId);
  const next = Math.max(0, user.simbaCoins - amount);
  return prisma.user.update({
    where: { userId },
    data: { simbaCoins: next }
  });
}

async function addSP(prisma, guildId, userId, amount) {
  const user = await ensureUser(prisma, guildId, userId);
  const next = clampInt32(user.simbaPoints + amount);
  const rank = getRankFromSp(next);
  return prisma.user.update({
    where: { userId },
    data: { simbaPoints: next, rankKey: rank.key }
  });
}

async function removeSP(prisma, guildId, userId, amount) {
  const user = await ensureUser(prisma, guildId, userId);
  const next = Math.max(0, user.simbaPoints - amount);
  const rank = getRankFromSp(next);
  return prisma.user.update({
    where: { userId },
    data: { simbaPoints: next, rankKey: rank.key }
  });
}

async function addLP(prisma, guildId, userId, amount) {
  const user = await ensureUser(prisma, guildId, userId);
  let level = user.level;
  let levelPoints = clampInt32(user.levelPoints + amount);
  let needed = getLpNeeded(level);
  while (levelPoints >= needed) {
    levelPoints -= needed;
    level += 1;
    needed = getLpNeeded(level);
  }
  return prisma.user.update({
    where: { userId },
    data: { level, levelPoints }
  });
}

async function removeLP(prisma, guildId, userId, amount) {
  const user = await ensureUser(prisma, guildId, userId);
  let level = user.level;
  let levelPoints = user.levelPoints - amount;
  while (levelPoints < 0 && level > 1) {
    level -= 1;
    levelPoints += getLpNeeded(level);
  }
  if (level === 1 && levelPoints < 0) levelPoints = 0;
  return prisma.user.update({
    where: { userId },
    data: { level, levelPoints }
  });
}

module.exports = { addSC, removeSC, addSP, removeSP, addLP, removeLP };
