const LEVEL_3_ROLE_ID = "736535821359906856";
const LEVEL_3_MIN_LEVEL = 3;

/**
 * Donne le rôle niveau 3 dès que le membre atteint le seuil.
 * Une fois obtenu, le rôle n’est **plus retiré** automatiquement (reset saison, baisse de LP, etc.).
 */
async function syncLevel3RoleForMember(member, level) {
  if (!member || member.user?.bot) return { ok: false, reason: "invalid_member" };
  const numericLevel = Number(level) || 0;
  const hasRole = member.roles.cache.has(LEVEL_3_ROLE_ID);
  if (numericLevel >= LEVEL_3_MIN_LEVEL && !hasRole) {
    const added = await member.roles.add(LEVEL_3_ROLE_ID).then(() => true).catch(() => false);
    return added ? { ok: true, action: "added" } : { ok: false, reason: "add_failed" };
  }
  return { ok: true, action: "noop" };
}

module.exports = {
  LEVEL_3_ROLE_ID,
  LEVEL_3_MIN_LEVEL,
  syncLevel3RoleForMember
};
