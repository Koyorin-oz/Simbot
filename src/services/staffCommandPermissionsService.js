const { PermissionFlagsBits } = require("discord.js");

/** Rôle : commandes **dev** + **admin** (visibilité + exécution côté bot). */
const DEFAULT_ADMIN_DEV_COMMAND_ROLE_ID = "739948639300092055";
/** Rôles : commandes **modération** (visibilité + exécution côté bot) + `/give-away`. */
const DEFAULT_MODERATION_COMMAND_ROLE_IDS = ["736488084929118298", "1125117876370669608"];
/** Bypass runtime : meme acces que si la personne avait admin + roles staff (sans les avoir sur Discord). */
const DEFAULT_COMMAND_OWNER_USER_IDS = ["965984018216665099", "1278372257483456603"];

function parseSnowflakeList(raw) {
  return String(raw || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{17,20}$/.test(s));
}

/**
 * Ensemble des user IDs bypass.
 * - `COMMAND_OWNER_USER_IDS` (virgules) : liste **exclusive** si definie.
 * - Sinon `COMMAND_OWNER_USER_ID` : **un seul** ID (comportement historique).
 * - Sinon : {@link DEFAULT_COMMAND_OWNER_USER_IDS}
 */
function getCommandOwnerBypassUserIdSet() {
  const multi = String(process.env.COMMAND_OWNER_USER_IDS || "").trim();
  if (multi) return new Set(parseSnowflakeList(multi));
  const single = String(process.env.COMMAND_OWNER_USER_ID || "").trim();
  if (single && /^\d{17,20}$/.test(single)) return new Set([single]);
  return new Set(DEFAULT_COMMAND_OWNER_USER_IDS);
}

function isCommandOwnerBypassUserId(userId) {
  if (!userId) return false;
  return getCommandOwnerBypassUserIdSet().has(String(userId));
}

function getAdminDevCommandRoleId() {
  return String(process.env.COMMAND_ADMIN_DEV_ROLE_ID || DEFAULT_ADMIN_DEV_COMMAND_ROLE_ID).trim();
}

/**
 * Rôles autorisés pour la catégorie modération + création giveaway.
 * - `COMMAND_MODERATION_ROLE_IDS` (virgules) : liste **exclusive** si definie.
 * - Sinon `COMMAND_MODERATION_ROLE_ID` ou `COMMAND_STAFF_ROLE_ID` : **un seul** role.
 * - Sinon : {@link DEFAULT_MODERATION_COMMAND_ROLE_IDS}
 */
function getModerationCommandRoleIdSet() {
  const multi = String(process.env.COMMAND_MODERATION_ROLE_IDS || "").trim();
  if (multi) return new Set(parseSnowflakeList(multi));
  const single = String(process.env.COMMAND_MODERATION_ROLE_ID || process.env.COMMAND_STAFF_ROLE_ID || "").trim();
  if (single && /^\d{17,20}$/.test(single)) return new Set([single]);
  return new Set(DEFAULT_MODERATION_COMMAND_ROLE_IDS);
}

/** @returns {string} Premier ID du set (compat tickets / ancien code). */
function getModerationCommandRoleId() {
  const first = [...getModerationCommandRoleIdSet()][0];
  return first ? String(first) : String(DEFAULT_MODERATION_COMMAND_ROLE_IDS[0]);
}

/** @deprecated Utiliser getModerationCommandRoleId — conservé pour anciens imports. */
function getStaffCommandRoleId() {
  return getModerationCommandRoleId();
}

/** @deprecated Prefer {@link isCommandOwnerBypassUserId} — retourne un ID « representatif » (1er du set). */
function getCommandOwnerBypassUserId() {
  const first = [...getCommandOwnerBypassUserIdSet()][0];
  return first ? String(first) : "";
}

function getCommandOwnerBypassUserIds() {
  return [...getCommandOwnerBypassUserIdSet()];
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
  getModerationCommandRoleIdSet,
  getCommandOwnerBypassUserId,
  getCommandOwnerBypassUserIds,
  isCommandOwnerBypassUserId,
  getStaffSlashDefaultMemberPermBigInt
};
