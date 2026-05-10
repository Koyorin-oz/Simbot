const config = require("../config");
const INT32_MAX = 2_147_483_647;

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clampInt32(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(INT32_MAX, Math.floor(n)));
}

function getRankFromSp(sp) {
  let current = config.rankSystem.thresholds[0];
  for (const tier of config.rankSystem.thresholds) {
    if (sp >= tier.minSp) current = tier;
  }
  return current;
}

function getLpNeeded(level) {
  return Math.floor(config.economy.levelBase * Math.pow(level, config.economy.levelExponent));
}

function resolveBoosts(user) {
  const now = Date.now();
  const coffeeActive = user.coffeeUntil && new Date(user.coffeeUntil).getTime() > now;
  const coffee = coffeeActive ? user.coffeeBoostPct : 0;
  const lpSpPermanent = user.crownOwned ? config.shop.crownBoostPct : 0;
  const scPermanent = user.piggyOwned ? config.shop.piggyBoostPct : 0;
  return { coffee, lpSpPermanent, scPermanent };
}

/**
 * Bonus % (activité) selon les boosts Nitro que le membre attribue à CE serveur.
 * @param {import("discord.js").GuildMember | null | undefined} guildMember
 */
function getServerBoostRewardPct(guildMember) {
  const r = config.economy.serverBoostReward;
  if (!r?.enabled) return 0;
  if (!guildMember || guildMember.user?.bot) return 0;
  const n = Number(guildMember.premiumSubscriptionCount);
  if (!Number.isFinite(n) || n < 1) return 0;
  if (n >= 2) return r.pctTwoPlusBoosts;
  return r.pctOneBoost;
}

async function ensureUser(prisma, guildId, userId) {
  try {
    return await prisma.user.upsert({
      where: { userId },
      create: { userId, guildId },
      update: { guildId }
    });
  } catch (e) {
    // Auto-recovery si la DB contient une valeur hors limite INT (erreur Prisma P2023).
    if (e?.code === "P2023") {
      await sanitizeEconomyIntRanges(prisma).catch(() => null);
      return prisma.user.upsert({
        where: { userId },
        create: { userId, guildId },
        update: { guildId }
      });
    }
    throw e;
  }
}

/**
 * @param {import("discord.js").GuildMember | null | undefined} [guildMember]
 *   Si fourni : bonus Nitro boost serveur sur SC / SP / LP (messages + vocal).
 */
async function addActivityGain(prisma, guildId, userId, baseGain, guildMember) {
  const user = await ensureUser(prisma, guildId, userId);
  const boosts = resolveBoosts(user);
  const serverBoostPct = getServerBoostRewardPct(guildMember);
  const scBoostPct = boosts.coffee + boosts.scPermanent + serverBoostPct;
  const spLpBoostPct = boosts.coffee + boosts.lpSpPermanent + serverBoostPct;
  const scGain = Math.floor(baseGain.sc * (1 + scBoostPct / 100));
  const spGain = Math.floor(baseGain.sp * (1 + spLpBoostPct / 100));
  const lpGain = Math.floor(baseGain.lp * (1 + spLpBoostPct / 100));

  const nextCoins = clampInt32((user.simbaCoins || 0) + scGain);
  let levelPoints = clampInt32((user.levelPoints || 0) + lpGain);
  let level = user.level;
  let needed = getLpNeeded(level);
  while (levelPoints >= needed) {
    levelPoints -= needed;
    level += 1;
    needed = getLpNeeded(level);
  }

  const totalSp = clampInt32((user.simbaPoints || 0) + spGain);
  const rank = getRankFromSp(totalSp);
  const prevRank = getRankFromSp(user.simbaPoints || 0);
  const prevLevel = user.level;
  const now = new Date();
  const updated = await prisma.user.update({
    where: { userId },
    data: {
      simbaCoins: nextCoins,
      simbaPoints: totalSp,
      levelPoints,
      level,
      rankKey: rank.key,
      lastActivityAt: now,
      lastSpDecayAt: null
    }
  });
  updated._gainMeta = {
    prevLevel,
    leveledUp: level > prevLevel,
    prevRankKey: prevRank.key,
    rankKeyChanged: prevRank.key !== rank.key
  };
  return updated;
}

function getRandomMessageGain() {
  return {
    sc: randomBetween(...config.economy.messageGain.sc),
    sp: randomBetween(...config.economy.messageGain.sp),
    lp: randomBetween(...config.economy.messageGain.lp)
  };
}

async function sanitizeEconomyIntRanges(prisma) {
  // Corrige les valeurs hors limite Int32 pour éviter les erreurs Prisma P2023.
  const sql = `
    UPDATE "User"
    SET
      "simbaCoins" = CASE
        WHEN "simbaCoins" > ${INT32_MAX} THEN ${INT32_MAX}
        WHEN "simbaCoins" < 0 THEN 0
        ELSE "simbaCoins"
      END,
      "simbaPoints" = CASE
        WHEN "simbaPoints" > ${INT32_MAX} THEN ${INT32_MAX}
        WHEN "simbaPoints" < 0 THEN 0
        ELSE "simbaPoints"
      END,
      "levelPoints" = CASE
        WHEN "levelPoints" > ${INT32_MAX} THEN ${INT32_MAX}
        WHEN "levelPoints" < 0 THEN 0
        ELSE "levelPoints"
      END
  `;
  try {
    return await prisma.$executeRawUnsafe(sql);
  } catch {
    // Fallback sqlite sans quotes pour compatibilite.
    return prisma.$executeRawUnsafe(sql.replaceAll('"', ""));
  }
}

module.exports = {
  getRankFromSp,
  getLpNeeded,
  ensureUser,
  addActivityGain,
  getRandomMessageGain,
  getServerBoostRewardPct,
  randomBetween,
  sanitizeEconomyIntRanges
};
