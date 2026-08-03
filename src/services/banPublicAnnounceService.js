/**
 * Filet entre /bannir et guildBanAdd : le modo choisit si le message public
 * (« CHEH T'ES BAN ») part dans le salon discussion.
 */
const PENDING_TTL_MS = 60_000;
/** @type {Map<string, { announce: boolean, expiresAt: number }>} */
const pending = new Map();

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

/**
 * À appeler juste avant `members.ban(...)`.
 * @param {string} guildId
 * @param {string} userId
 * @param {boolean} announce
 */
function setPendingBanAnnounce(guildId, userId, announce) {
  pending.set(key(guildId, userId), {
    announce: Boolean(announce),
    expiresAt: Date.now() + PENDING_TTL_MS
  });
}

/**
 * Consomme le choix (une seule fois). `null` = ban hors /bannir (client Discord, autre bot…).
 * @param {string} guildId
 * @param {string} userId
 * @returns {boolean | null}
 */
function consumePendingBanAnnounce(guildId, userId) {
  const k = key(guildId, userId);
  const entry = pending.get(k);
  if (!entry) return null;
  pending.delete(k);
  if (Date.now() > entry.expiresAt) return null;
  return entry.announce;
}

module.exports = {
  setPendingBanAnnounce,
  consumePendingBanAnnounce
};
