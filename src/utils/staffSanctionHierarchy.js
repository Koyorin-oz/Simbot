/**
 * Hiérarchie staff La Carminauté : un modérateur ne peut pas sanctionner
 * quelqu'un qui a un rôle staff **strictement plus haut** (ou égal).
 *
 * Ordre : index 0 = plus haut pouvoir. Un index plus petit peut sanctionner un index plus grand.
 * Surcharge possible : STAFF_SANCTION_HIERARCHY_IDS=id1,id2,... (du plus haut au plus bas).
 */
const { getCommandOwnerBypassUserId } = require("../services/staffCommandPermissionsService");

/** Du plus puissant au moins puissant (IDs Discord). */
const DEFAULT_HIERARCHY_TOP_TO_BOTTOM = [
  "735585964386418699", // Mufasa — grand owner
  "1309082855326093383", // Hugo boss — owner
  "1311064337984651344", // CRS du serveur — owner
  "739948639300092055", // Scar admin — administrateur
  "983424179695140906", // Grand Rafiki — super modérateur
  "736488084929118298" // Rafiki — modérateur
];

function getHierarchyRoleIds() {
  const raw = String(process.env.STAFF_SANCTION_HIERARCHY_IDS || "").trim();
  if (raw) {
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [...DEFAULT_HIERARCHY_TOP_TO_BOTTOM];
}

/**
 * Plus petit index = plus haut dans la hiérarchie staff.
 * @param {import("discord.js").GuildMember | null | undefined} member
 * @returns {number | null}
 */
function getStaffHierarchyIndex(member) {
  if (!member?.roles?.cache) return null;
  const ids = getHierarchyRoleIds();
  let best = null;
  for (let i = 0; i < ids.length; i++) {
    if (member.roles.cache.has(ids[i])) {
      best = best === null ? i : Math.min(best, i);
    }
  }
  return best;
}

/**
 * @param {import("discord.js").GuildMember} moderator
 * @param {import("discord.js").GuildMember | null} targetMember - null si pas sur le serveur
 * @param {import("discord.js").Guild} guild
 * @param {string} actorUserId
 * @returns {string | null} message d'erreur utilisateur, ou null si OK
 */
function assertCanSanctionMember(moderator, targetMember, guild, actorUserId) {
  if (!moderator) return "Impossible de vérifier ton profil membre sur ce serveur.";

  const ownerBypass = String(getCommandOwnerBypassUserId() || "").trim();
  if (ownerBypass && actorUserId === ownerBypass) return null;
  if (guild.ownerId === actorUserId) return null;

  if (!targetMember) return null;

  if (targetMember.id === actorUserId) return "Tu ne peux pas t'appliquer cette action à toi-même.";

  if (targetMember.id === guild.ownerId) {
    return "Tu ne peux pas sanctionner le propriétaire du serveur.";
  }

  const modIdx = getStaffHierarchyIndex(moderator);
  const tgtIdx = getStaffHierarchyIndex(targetMember);

  if (tgtIdx !== null) {
    if (modIdx === null) {
      return "Tu ne peux pas sanctionner un membre du staff : ton rôle n'est pas dans la hiérarchie staff reconnue par le bot.";
    }
    if (modIdx >= tgtIdx) {
      return "Tu ne peux pas sanctionner un membre du staff de **rang égal ou supérieur** au tien (hiérarchie Rafiki → … → Mufasa).";
    }
    return null;
  }

  try {
    if (moderator.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
      return "Tu ne peux pas sanctionner ce membre : son rôle le plus haut est au-dessus ou égal au tien (hiérarchie Discord).";
    }
  } catch {
    return "Impossible de comparer les rôles (hiérarchie Discord).";
  }

  return null;
}

module.exports = {
  getHierarchyRoleIds,
  getStaffHierarchyIndex,
  assertCanSanctionMember,
  DEFAULT_HIERARCHY_TOP_TO_BOTTOM
};
