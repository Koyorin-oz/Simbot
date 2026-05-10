const config = require("../config");

/**
 * Le membre attribue au moins un boost Nitro à cette guilde.
 * @param {import("discord.js").GuildMember} member
 */
function isBoostingThisGuild(member) {
  if (!member?.user || member.user.bot) return false;
  const n = Number(member.premiumSubscriptionCount);
  if (Number.isFinite(n) && n > 0) return true;
  return Boolean(member.premiumSince);
}

/**
 * Signature pour détecter un changement Nitro / boost sur ce serveur.
 * @param {import("discord.js").GuildMember} member
 */
function boostStateKey(member) {
  return `${member.premiumSinceTimestamp ?? "n"}:${member.premiumSubscriptionCount ?? "n"}`;
}

/**
 * Ajoute ou retire le rôle configuré pour refléter le boost serveur.
 * @param {import("discord.js").GuildMember} member
 */
async function syncBoosterRole(member) {
  const sync = config.serverBoosterRoleSync;
  if (!sync?.enabled) return;
  const roleId = String(sync.roleId || "").trim();
  const guildId = String(sync.guildId || "").trim();
  if (!roleId || !guildId) return;
  if (!member?.guild || member.guild.id !== guildId) return;
  if (member.user.bot) return;

  const role = await member.guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    console.warn(`[BOOSTER_ROLE_SYNC] Rôle introuvable (${roleId}).`);
    return;
  }

  const should = isBoostingThisGuild(member);
  const has = member.roles.cache.has(roleId);

  try {
    if (should && !has) {
      await member.roles.add(role, "Boost serveur Nitro — rôle synchronisé.");
    } else if (!should && has) {
      await member.roles.remove(role, "Plus de boost serveur — rôle synchronisé.");
    }
  } catch (e) {
    console.warn(
      `[BOOSTER_ROLE_SYNC] ${member.user.tag} (${member.id}):`,
      e?.message || e
    );
  }
}

/**
 * Appeler depuis `guildMemberUpdate` uniquement si l’état boost a changé.
 * @param {import("discord.js").GuildMember} oldMember
 * @param {import("discord.js").GuildMember} newMember
 */
async function maybeSyncBoosterRoleAfterUpdate(oldMember, newMember) {
  const sync = config.serverBoosterRoleSync;
  if (!sync?.enabled) return;
  if (boostStateKey(oldMember) === boostStateKey(newMember)) return;
  await syncBoosterRole(newMember);
}

module.exports = {
  isBoostingThisGuild,
  boostStateKey,
  syncBoosterRole,
  maybeSyncBoosterRoleAfterUpdate
};
