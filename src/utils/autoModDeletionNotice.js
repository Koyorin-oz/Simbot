const { EmbedBuilder } = require("discord.js");

/** Bordure gauche type Driftbot (orange / rouge). */
const NOTICE_COLOR = 0xf26522;

const NOTICE_COOLDOWN_MS = 3500;

function buildForbiddenWordEmbed() {
  return new EmbedBuilder()
    .setColor(NOTICE_COLOR)
    .setDescription(
      "❌ Votre message a été supprimé, car il contenait **un mot interdit sur le serveur**."
    );
}

function buildForbiddenLinkEmbed() {
  return new EmbedBuilder()
    .setColor(NOTICE_COLOR)
    .setDescription(
      "❌ Votre message a été supprimé, car il contenait **un lien non autorisé sur ce serveur**."
    );
}

/**
 * @param {"word"|"link"} kind
 */
function buildNoticeEmbed(kind) {
  return kind === "link" ? buildForbiddenLinkEmbed() : buildForbiddenWordEmbed();
}

/**
 * @param {import("discord.js").Client} client
 * @param {string} guildId
 * @param {string} userId
 * @param {"word"|"link"} kind
 */
function canSendDeletionNotice(client, guildId, userId, kind) {
  if (!client._autoModDeletionNoticeCooldowns) client._autoModDeletionNoticeCooldowns = new Map();
  const map = client._autoModDeletionNoticeCooldowns;
  const key = `${guildId}:${userId}:${kind}`;
  const now = Date.now();
  const last = map.get(key) || 0;
  if (now - last < NOTICE_COOLDOWN_MS) return false;
  map.set(key, now);
  return true;
}

/**
 * Mention + embed (comme Driftbot).
 * @param {import("discord.js").TextBasedChannel} channel
 * @param {string} userId
 * @param {"word"|"link"} kind
 * @param {import("discord.js").Client} client
 */
async function sendAutoModDeletionNotice(channel, userId, kind, client) {
  if (!channel?.isTextBased?.()) return;
  const gid = channel.guildId;
  if (!gid || !canSendDeletionNotice(client, gid, userId, kind)) return;
  await channel
    .send({
      content: `<@${userId}>`,
      embeds: [buildNoticeEmbed(kind)],
      allowedMentions: { users: [userId] }
    })
    .catch(() => null);
}

module.exports = {
  sendAutoModDeletionNotice,
  buildForbiddenWordEmbed,
  buildForbiddenLinkEmbed,
  NOTICE_COLOR
};
