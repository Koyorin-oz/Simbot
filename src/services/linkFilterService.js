/**
 * Détection de liens + zones autorisées (salons / catégorie / rôle bypass).
 */

const LINK_DETECT_RE =
  /https?:\/\/[^\s<>"']+|discord\.gg\/[a-zA-Z0-9-]+|discord(?:app)?\.com\/invite\/[a-zA-Z0-9-]+|\bwww\.[^\s]+\.[a-z]{2,}[^\s]*/gi;

/**
 * @param {string} content
 */
function messageContainsLink(content) {
  const c = String(content || "");
  LINK_DETECT_RE.lastIndex = 0;
  return LINK_DETECT_RE.test(c);
}

/**
 * @param {import("discord.js").GuildBasedChannel} channel
 * @param {Set<string>} allowedChannelIds
 * @param {string} [allowedCategoryId]
 */
function isChannelInAllowedLinkZone(channel, allowedChannelIds, allowedCategoryId) {
  if (!channel) return false;
  if (allowedChannelIds.has(channel.id)) return true;

  let categoryId = null;
  if (channel.isThread()) {
    const parent = channel.parent;
    if (!parent) return false;
    if (allowedChannelIds.has(parent.id)) return true;
    categoryId = parent.parentId;
  } else {
    categoryId = channel.parentId;
  }

  if (allowedCategoryId && categoryId === allowedCategoryId) return true;
  return false;
}

/**
 * @param {import("discord.js").GuildMember | null} member
 * @param {string} bypassRoleId
 */
function hasLinkBypassRole(member, bypassRoleId) {
  if (!member || !bypassRoleId) return false;
  return Boolean(member.roles?.cache?.has(bypassRoleId));
}

/**
 * @param {import("discord.js").Message} message
 * @param {{ guildId: string, enabled: boolean, allowedChannelIds: string[], allowedCategoryId: string, bypassRoleId: string }} cfg
 * @param {import("discord.js").GuildMember | null} member
 */
function shouldBlockLinksForMessage(message, cfg, member) {
  if (!cfg?.enabled) return false;
  if (!message.guild || message.guild.id !== cfg.guildId) return false;
  if (!messageContainsLink(message.content)) return false;
  if (hasLinkBypassRole(member, cfg.bypassRoleId)) return false;
  const allowedIds = new Set(cfg.allowedChannelIds || []);
  if (isChannelInAllowedLinkZone(message.channel, allowedIds, cfg.allowedCategoryId)) return false;
  return true;
}

module.exports = {
  messageContainsLink,
  isChannelInAllowedLinkZone,
  hasLinkBypassRole,
  shouldBlockLinksForMessage
};
