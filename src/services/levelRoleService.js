const { PermissionFlagsBits } = require("discord.js");

const LEVEL_3_ROLE_ID = "1522984537997705236";
const LEVEL_3_MIN_LEVEL = 3;
const LEVEL_3_MEDIA_CHANNEL_IDS = ["735644918789439496", "1454870112141050099"];

/**
 * Donne le rôle média niveau 3 dès que le membre atteint le seuil.
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
 * Les salons médias ciblés doivent refuser les pièces jointes à `@everyone`
 * et les autoriser au rôle niveau 3.
 * @param {import("discord.js").Guild} guild
 */
async function syncLevel3MediaPermissionsForGuild(guild) {
  if (!guild) return { ok: false, reason: "invalid_guild", scanned: 0 };
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return { ok: false, reason: "no_manage_channels", scanned: 0 };
  }

  let scanned = 0;
  for (const channelId of LEVEL_3_MEDIA_CHANNEL_IDS) {
    // eslint-disable-next-line no-await-in-loop
    const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel?.isTextBased?.() || !channel.permissionOverwrites) continue;
    scanned += 1;

    // eslint-disable-next-line no-await-in-loop
    await channel.permissionOverwrites
      .edit(guild.roles.everyone.id, { AttachFiles: false }, "Restriction medias : rôle niveau 3 requis")
      .catch(() => null);

    // eslint-disable-next-line no-await-in-loop
    await channel.permissionOverwrites
      .edit(LEVEL_3_ROLE_ID, { AttachFiles: true }, "Acces medias niveau 3")
      .catch(() => null);
  }

  return { ok: true, scanned };
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
  LEVEL_3_MEDIA_CHANNEL_IDS,
  syncLevel3RoleForMember,
  syncLevel3RoleForGuild,
  syncLevel3MediaPermissionsForGuild
};
