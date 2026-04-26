/**
 * Hiérarchie des sanctions = **celle de Discord** (Paramètres serveur → Rôles : plus haut dans la liste = plus de pouvoir).
 * Un modérateur ne peut pas sanctionner quelqu’un dont le **rôle le plus haut** est au-dessus ou au même niveau que le sien.
 *
 * À part : propriétaire du serveur et bypass propriétaire commandes (`COMMAND_OWNER_USER_ID` / `COMMAND_OWNER_USER_IDS`) peuvent tout faire (comme Discord).
 *
 * Important : **timeout / ban / kick** sont appliqués **par le bot**. Le rôle **du bot** doit aussi être **au-dessus**
 * de la cible, sinon Discord refuse même si toi tu es admin — voir `formatBotHierarchyBlockReason`.
 */
const { isCommandOwnerBypassUserId } = require("../services/staffCommandPermissionsService");

/**
 * @param {import("discord.js").GuildMember} moderator
 * @param {import("discord.js").GuildMember | null} targetMember
 * @param {import("discord.js").Guild} guild
 * @param {string} actorUserId
 * @returns {string | null} message d’erreur, ou null si OK
 */
function assertCanSanctionMember(moderator, targetMember, guild, actorUserId) {
  if (!moderator) return "Impossible de vérifier ton profil membre sur ce serveur.";

  if (isCommandOwnerBypassUserId(actorUserId)) return null;
  if (guild.ownerId === actorUserId) return null;

  if (!targetMember) return null;

  if (targetMember.id === actorUserId) return "Tu ne peux pas t'appliquer cette action à toi-même.";

  if (targetMember.id === guild.ownerId) {
    return "Tu ne peux pas sanctionner le propriétaire du serveur.";
  }

  try {
    if (moderator.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
      return "Tu ne peux pas sanctionner ce membre : dans **Paramètres serveur → Rôles**, son rôle le plus haut est **au-dessus ou au même niveau** que le tien. Monte ton rôle au-dessus du sien (ex. Admin au-dessus d’Animateur).";
    }
  } catch {
    return "Impossible de comparer les rôles (hiérarchie Discord).";
  }

  return null;
}

/**
 * Si le bot ne peut pas modérer la cible à cause de la hiérarchie des rôles, message explicite ; sinon `null`.
 * @param {import("discord.js").Guild} guild
 * @param {import("discord.js").GuildMember} targetMember
 * @returns {string | null}
 */
function formatBotHierarchyBlockReason(guild, targetMember) {
  const me = guild.members.me;
  if (!me?.roles?.highest || !targetMember?.roles?.highest) return null;
  try {
    if (me.roles.highest.comparePositionTo(targetMember.roles.highest) > 0) return null;
  } catch {
    return null;
  }
  const botRole = me.roles.highest.name;
  const targetRole = targetMember.roles.highest.name;
  return [
    "Discord refuse que **j’applique** la sanction : mon rôle du bot n’est pas assez haut.",
    `Mon rôle le plus haut : **${botRole}** — celui de la cible : **${targetRole}**.`,
    `Dans **Paramètres serveur → Rôles**, glisse le rôle **${me.client.user?.username || "SimBot"}** **au-dessus** de **${targetRole}** (et des autres rôles à modérer).`
  ].join("\n");
}

module.exports = {
  assertCanSanctionMember,
  formatBotHierarchyBlockReason
};
