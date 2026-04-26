const { PermissionFlagsBits } = require("discord.js");

/** IDs utilisateurs autorisés en plus des admins (prompts IA, etc.). Surcharge : `IA_OWNER_USER_IDS` dans `.env` (séparateur virgule). */
function getIaOwnerUserIds() {
  const raw = String(process.env.IA_OWNER_USER_IDS || "").trim();
  if (raw) {
    return new Set(raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean));
  }
  return new Set(["965984018216665099", "1278372257483456603"]);
}

/**
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 */
function canManageIaCommands(interaction) {
  const uid = interaction.user?.id;
  if (!uid) return false;
  if (getIaOwnerUserIds().has(uid)) return true;
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

/**
 * @param {import("discord.js").GuildMember|null} member
 * @param {string} userId
 */
function canManageIaMessage(member, userId) {
  if (!userId) return false;
  if (getIaOwnerUserIds().has(userId)) return true;
  return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));
}

module.exports = {
  getIaOwnerUserIds,
  canManageIaCommands,
  canManageIaMessage
};
