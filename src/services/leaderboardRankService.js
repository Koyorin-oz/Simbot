/**
 * Rang du membre pour un métrique donné (serveur), avec tie-break stable sur userId.
 * @param {"sc"|"sp"|"lp"} metric
 */
async function getGuildLeaderboardRank(prisma, guildId, userId, metric) {
  const user = await prisma.user.findUnique({ where: { userId } });
  if (!user || user.guildId !== guildId) return null;

  const field = metric === "sc" ? "simbaCoins" : metric === "sp" ? "simbaPoints" : "levelPoints";
  const myVal = Number(user[field] ?? 0);

  const ahead = await prisma.user.count({
    where: {
      guildId,
      OR: [{ [field]: { gt: myVal } }, { AND: [{ [field]: myVal }, { userId: { lt: userId } }] }]
    }
  });

  return { rank: ahead + 1, value: myVal };
}

module.exports = { getGuildLeaderboardRank };
