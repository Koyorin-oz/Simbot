const config = require("../config");
const { getRankFromSp } = require("./economyService");
const { syncRankRoleForMember } = require("./rankRoleService");

const ELITE_RANK_KEYS = new Set(["nala_1", "nala_2", "nala_3", "scar", "cardinal"]);

function decayAmountForRank(rankKey) {
  const d = config.economy.spDecay;
  if (!d?.enabled) return 0;
  if (String(rankKey).startsWith("nala")) return d.nalaSpPerTick;
  if (rankKey === "scar") return d.scarSpPerTick;
  if (rankKey === "cardinal") return d.cardinalSpPerTick;
  return 0;
}

/**
 * Retire des SP aux membres Nala+ inactifs (pas de gain message/vocal depuis graceHours).
 * Un tick au plus tous les tickHours par membre.
 */
async function processSpDecayForGuild(client, prisma, guild) {
  const d = config.economy.spDecay;
  if (!d?.enabled) return 0;

  const graceMs = d.graceHours * 3600000;
  const tickMs = d.tickHours * 3600000;
  const now = Date.now();

  const users = await prisma.user.findMany({ where: { guildId: guild.id } });
  let decayed = 0;

  for (const u of users) {
    const rank = getRankFromSp(u.simbaPoints);
    if (!ELITE_RANK_KEYS.has(rank.key)) continue;

    const lastAct = u.lastActivityAt ? new Date(u.lastActivityAt).getTime() : now;
    if (now - lastAct < graceMs) continue;

    const lastDecay = u.lastSpDecayAt ? new Date(u.lastSpDecayAt).getTime() : 0;
    if (lastDecay && now - lastDecay < tickMs) continue;

    const amt = decayAmountForRank(rank.key);
    if (amt <= 0) continue;

    const nextSp = Math.max(0, u.simbaPoints - amt);
    const newRank = getRankFromSp(nextSp);

    // eslint-disable-next-line no-await-in-loop
    await prisma.user.update({
      where: { userId: u.userId },
      data: {
        simbaPoints: nextSp,
        rankKey: newRank.key,
        lastSpDecayAt: new Date(now)
      }
    });

    decayed += 1;
    // eslint-disable-next-line no-await-in-loop
    const member = await guild.members.fetch(u.userId).catch(() => null);
    if (member) {
      // eslint-disable-next-line no-await-in-loop
      await syncRankRoleForMember(client, member, nextSp);
    }
  }

  return decayed;
}

async function processSpDecay(client) {
  if (!client?.prisma) return 0;
  let total = 0;
  for (const guild of client.guilds.cache.values()) {
    // eslint-disable-next-line no-await-in-loop
    const n = await processSpDecayForGuild(client, client.prisma, guild).catch(() => 0);
    total += n;
  }
  if (total > 0) console.log(`[SP-DECAY] ${total} membre(s) penalise(s) pour inactivite.`);
  return total;
}

module.exports = { processSpDecay, processSpDecayForGuild };
