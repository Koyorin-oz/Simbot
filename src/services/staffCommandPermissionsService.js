const { PermissionFlagsBits } = require("discord.js");

/** Rôle : commandes **dev** + **admin** (visibilité + exécution côté bot). */
const DEFAULT_ADMIN_DEV_COMMAND_ROLE_ID = "739948639300092055";
/** Rôle : commandes **modération** (visibilité + exécution côté bot). */
const DEFAULT_MODERATION_COMMAND_ROLE_ID = "736488084929118298";
const DEFAULT_COMMAND_OWNER_USER_ID = "965984018216665099";

function getAdminDevCommandRoleId() {
  return String(process.env.COMMAND_ADMIN_DEV_ROLE_ID || DEFAULT_ADMIN_DEV_COMMAND_ROLE_ID).trim();
}

function getModerationCommandRoleId() {
  return String(
    process.env.COMMAND_MODERATION_ROLE_ID ||
      process.env.COMMAND_STAFF_ROLE_ID ||
      DEFAULT_MODERATION_COMMAND_ROLE_ID
  ).trim();
}

/** @deprecated Utiliser getModerationCommandRoleId — conservé pour anciens imports. */
function getStaffCommandRoleId() {
  return getModerationCommandRoleId();
}

function getCommandOwnerBypassUserId() {
  return String(process.env.COMMAND_OWNER_USER_ID || DEFAULT_COMMAND_OWNER_USER_ID).trim();
}

/**
 * Ancienne astuce UI : meme permission Discord pour plusieurs rôles (ex. ManageGuild).
 * Les bots ne peuvent plus modifier les permissions des commandes par API ; l’affichage se regle dans Integrations.
 * @deprecated Peu utilise ; conserve pour compatibilite eventuelle.
 */
function getStaffSlashDefaultMemberPermBigInt() {
  const raw = process.env.COMMAND_STAFF_PERMISSION_BIT;
  if (raw !== undefined && String(raw).trim() !== "") {
    try {
      return BigInt(String(raw).trim());
    } catch {
      return PermissionFlagsBits.ManageGuild;
    }
  }
  return PermissionFlagsBits.ManageGuild;
}

module.exports = {
  getStaffCommandRoleId,
  getAdminDevCommandRoleId,
  getModerationCommandRoleId,
  getCommandOwnerBypassUserId,
  getStaffSlashDefaultMemberPermBigInt
};
