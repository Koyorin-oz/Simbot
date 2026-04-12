const { PermissionFlagsBits } = require("discord.js");
const { logApiError } = require("../utils/botLogger");

const TICK_MS = 60_000;

function stopTempBanScheduler(client) {
  if (!client.tempBanInterval) return;
  clearInterval(client.tempBanInterval);
  client.tempBanInterval = null;
}

/**
 * Debannit automatiquement les bans temporaires dont `Punishment.expiresAt` est depasse.
 */
function startTempBanScheduler(client) {
  stopTempBanScheduler(client);

  const tick = async () => {
    if (!client?.prisma) return;
    const now = new Date();
    let due;
    try {
      due = await client.prisma.punishment.findMany({
        where: {
          type: "BAN",
          expiresAt: { not: null, lte: now }
        },
        orderBy: { expiresAt: "asc" },
        take: 100
      });
    } catch (e) {
      logApiError("TEMP_BAN_SCHEDULER_QUERY", e, { maxDetailChars: 200 });
      return;
    }

    for (const row of due) {
      const guild = await client.guilds.fetch(row.guildId).catch(() => null);
      if (!guild) {
        await client.prisma.punishment
          .update({ where: { id: row.id }, data: { expiresAt: null } })
          .catch(() => null);
        continue;
      }
      const me = guild.members.me;
      if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) continue;

      const ban = await guild.bans.fetch(row.userId).catch(() => null);
      if (!ban) {
        await client.prisma.punishment
          .updateMany({
            where: {
              guildId: row.guildId,
              userId: row.userId,
              type: "BAN",
              expiresAt: { not: null }
            },
            data: { expiresAt: null }
          })
          .catch(() => null);
        continue;
      }

      try {
        await guild.members.unban(row.userId, "Fin du ban temporaire (duree ecoulee)");
      } catch (e) {
        logApiError("TEMP_BAN_UNBAN", e, { maxDetailChars: 200 });
        continue;
      }

      await client.prisma.punishment
        .update({
          where: { id: row.id },
          data: {
            expiresAt: null,
            reason: `${row.reason} [auto: fin ban temporelle]`
          }
        })
        .catch(() => null);
    }
  };

  client.tempBanInterval = setInterval(() => {
    tick().catch((e) => logApiError("TEMP_BAN_SCHEDULER_TICK", e, { maxDetailChars: 200 }));
  }, TICK_MS);

  tick().catch(() => null);
}

module.exports = { startTempBanScheduler, stopTempBanScheduler };
