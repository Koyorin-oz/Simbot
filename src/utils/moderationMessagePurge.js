const { PermissionFlagsBits } = require("discord.js");

/** Plages alignées sur le ban Discord (max 7 jours). Valeur = secondes en string pour les choices slash. */
const DELETE_MESSAGE_HISTORY_CHOICES = [
  { name: "Non", value: "0" },
  { name: "Dernière heure", value: "3600" },
  { name: "6 dernières heures", value: "21600" },
  { name: "12 dernières heures", value: "43200" },
  { name: "Dernières 24 heures", value: "86400" },
  { name: "3 derniers jours", value: "259200" },
  { name: "7 derniers jours (max)", value: "604800" }
];

const DISCORD_BAN_DELETE_MAX_SECONDS = 604800;
const MAX_PURGE_PASSES_PER_CHANNEL = 45;
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * @param {string | null | undefined} choiceValue
 * @returns {number} secondes, 0 si absent ou invalide
 */
function parseDeleteMessageSecondsFromChoice(choiceValue) {
  const n = parseInt(String(choiceValue ?? "0"), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, DISCORD_BAN_DELETE_MAX_SECONDS);
}

/**
 * Expulsion : pas d’option API — on supprime à la main (bulkDelete : messages de moins de 14 jours seulement).
 * @param {import("discord.js").Guild} guild
 * @param {string} userId
 * @param {number} windowSeconds
 * @returns {Promise<number>} nombre de messages supprimés
 */
async function purgeUserMessagesInWindow(guild, userId, windowSeconds) {
  if (!windowSeconds || windowSeconds <= 0) return 0;
  const cutoff = Date.now() - windowSeconds * 1000;
  let total = 0;
  const me = guild.members.me;
  if (!me) return 0;

  for (const channel of guild.channels.cache.values()) {
    if (!channel.isTextBased?.() || channel.isDMBased?.()) continue;
    const perms = channel.permissionsFor(me);
    if (!perms?.has(PermissionFlagsBits.ViewChannel)) continue;
    if (!perms?.has(PermissionFlagsBits.ManageMessages)) continue;
    if (!perms?.has(PermissionFlagsBits.ReadMessageHistory)) continue;

    let before;
    let passes = 0;
    while (passes++ < MAX_PURGE_PASSES_PER_CHANNEL) {
      const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
      if (!batch || batch.size === 0) break;

      const userMsgs = batch.filter((m) => {
        if (m.author.id !== userId) return false;
        if (m.createdTimestamp < cutoff) return false;
        if (Date.now() - m.createdTimestamp > TWO_WEEKS_MS) return false;
        return true;
      });

      if (userMsgs.size > 0) {
        const deleted = await channel.bulkDelete(userMsgs, true).catch(() => null);
        if (deleted?.size) total += deleted.size;
      }

      const oldest = batch.last();
      if (!oldest || oldest.createdTimestamp < cutoff) break;
      before = oldest.id;
      if (batch.size < 100) break;
    }
  }

  return total;
}

module.exports = {
  DELETE_MESSAGE_HISTORY_CHOICES,
  parseDeleteMessageSecondsFromChoice,
  purgeUserMessagesInWindow,
  DISCORD_BAN_DELETE_MAX_SECONDS
};
