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

/**
 * Resynchronise le rôle niveau 3 pour tous les membres déjà >= seuil dans la base.
 * Utile si des membres ont gagné des niveaux avant l'ajout/fix du rôle.
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Guild} guild
 */
async function syncLevel3RoleForGuild(client, guild) {
  if (!client?.prisma || !guild) return { ok: false, reason: "invalid_context", scanned: 0, added: 0 };

  const rows = await client.prisma.user.findMany({
    where: { guildId: guild.id, level: { gte: LEVEL_3_MIN_LEVEL } },
    select: { userId: true, level: true }
  });

  let scanned = 0;
  let added = 0;

  for (const row of rows) {
    scanned += 1;
    // eslint-disable-next-line no-await-in-loop
    const member =
      guild.members.cache.get(row.userId) ||
      (await guild.members.fetch(row.userId).catch(() => null));
    if (!member || member.user?.bot) continue;
    // eslint-disable-next-line no-await-in-loop
    const result = await syncLevel3RoleForMember(member, row.level).catch(() => ({ ok: false }));
    if (result?.ok && result.action === "added") added += 1;
  }

  return { ok: true, scanned, added };
}

module.exports = {
  LEVEL_3_ROLE_ID,
  LEVEL_3_MIN_LEVEL,
  syncLevel3RoleForMember,
  syncLevel3RoleForGuild
};
