const { PermissionFlagsBits } = require("discord.js");

/** Rôle niveau 5 — médias dans le salon principal. */
const LEVEL_3_ROLE_ID = "736535821359906856";
/** Nom legacy conservé pour éviter de retoucher tous les imports : ce palier est désormais niveau 5. */
const LEVEL_3_MIN_LEVEL = 5;
const LEVEL_3_MEDIA_CHANNEL_IDS = ["738884759287103610"];
/** Rôle abonné / amis maux — donné après vérification. */
const ABONNE_MEDIA_ROLE_ID = "973960786290544690";
const ABONNE_MEDIA_CHANNEL_IDS = ["735644918789439496", "1454870112141050099"];
/** Rôle créé par erreur — retiré des overwrites et des membres lors de la sync. */
const LEGACY_MISTAKEN_LEVEL_ROLE_ID = "1522984537997705236";

/**
 * Donne le rôle média du salon principal dès que le membre atteint le seuil.
 * Une fois obtenu, le rôle n’est **plus retiré** automatiquement (reset saison, baisse de LP, etc.).
 */
async function syncLevel3RoleForMember(member, level) {
  if (!member || member.user?.bot) return { ok: false, reason: "invalid_member" };
  const numericLevel = Number(level) || 0;

  if (member.roles.cache.has(LEGACY_MISTAKEN_LEVEL_ROLE_ID)) {
    await member.roles.remove(LEGACY_MISTAKEN_LEVEL_ROLE_ID, "Rôle niveau média erroné — remplacé").catch(() => null);
  }

  const hasRole = member.roles.cache.has(LEVEL_3_ROLE_ID);
  if (numericLevel >= LEVEL_3_MIN_LEVEL && !hasRole) {
    const added = await member.roles.add(LEVEL_3_ROLE_ID).then(() => true).catch(() => false);
    return added ? { ok: true, action: "added" } : { ok: false, reason: "add_failed" };
  }
  return { ok: true, action: "noop" };
}

/**
 * Applique les permissions médias :
 * - salon principal : rôle palier niveau 5
 * - salons mèmes / humour noir : rôle abonné
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
      .edit(guild.roles.everyone.id, { AttachFiles: false }, "Restriction medias : rôle niveau 5 requis")
      .catch(() => null);

    // eslint-disable-next-line no-await-in-loop
    await channel.permissionOverwrites
      .edit(LEVEL_3_ROLE_ID, { AttachFiles: true }, "Acces medias niveau 5")
      .catch(() => null);

    const staleAbonneOw = channel.permissionOverwrites.cache.get(ABONNE_MEDIA_ROLE_ID);
    if (staleAbonneOw) {
      // eslint-disable-next-line no-await-in-loop
      await channel.permissionOverwrites
        .delete(ABONNE_MEDIA_ROLE_ID, "Nettoyage overwrite abonne hors salons dédiés")
        .catch(() => null);
    }

    const staleLegacyOw = channel.permissionOverwrites.cache.get(LEGACY_MISTAKEN_LEVEL_ROLE_ID);
    if (staleLegacyOw) {
      // eslint-disable-next-line no-await-in-loop
      await channel.permissionOverwrites
        .delete(LEGACY_MISTAKEN_LEVEL_ROLE_ID, "Nettoyage rôle niveau média erroné")
        .catch(() => null);
    }
  }

  for (const channelId of ABONNE_MEDIA_CHANNEL_IDS) {
    // eslint-disable-next-line no-await-in-loop
    const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel?.isTextBased?.() || !channel.permissionOverwrites) continue;
    scanned += 1;

    // eslint-disable-next-line no-await-in-loop
    await channel.permissionOverwrites
      .edit(guild.roles.everyone.id, { AttachFiles: false }, "Restriction medias : rôle abonné requis")
      .catch(() => null);

    // eslint-disable-next-line no-await-in-loop
    await channel.permissionOverwrites
      .edit(ABONNE_MEDIA_ROLE_ID, { AttachFiles: true }, "Acces medias rôle abonné")
      .catch(() => null);

    const staleLevelOw = channel.permissionOverwrites.cache.get(LEVEL_3_ROLE_ID);
    if (staleLevelOw) {
      // eslint-disable-next-line no-await-in-loop
      await channel.permissionOverwrites
        .delete(LEVEL_3_ROLE_ID, "Nettoyage overwrite niveau hors salon principal")
        .catch(() => null);
    }

    const staleLegacyOw = channel.permissionOverwrites.cache.get(LEGACY_MISTAKEN_LEVEL_ROLE_ID);
    if (staleLegacyOw) {
      // eslint-disable-next-line no-await-in-loop
      await channel.permissionOverwrites
        .delete(LEGACY_MISTAKEN_LEVEL_ROLE_ID, "Nettoyage rôle niveau média erroné")
        .catch(() => null);
    }
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

  let legacyRemoved = 0;
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot || !member.roles.cache.has(LEGACY_MISTAKEN_LEVEL_ROLE_ID)) continue;
    // eslint-disable-next-line no-await-in-loop
    const ok = await member.roles.remove(LEGACY_MISTAKEN_LEVEL_ROLE_ID, "Rôle niveau média erroné — remplacé").then(() => true).catch(() => false);
    if (ok) legacyRemoved += 1;
  }

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

  return { ok: true, scanned, added, legacyRemoved };
}

module.exports = {
  LEVEL_3_ROLE_ID,
  LEVEL_3_MIN_LEVEL,
  LEVEL_3_MEDIA_CHANNEL_IDS,
  ABONNE_MEDIA_ROLE_ID,
  ABONNE_MEDIA_CHANNEL_IDS,
  syncLevel3RoleForMember,
  syncLevel3RoleForGuild,
  syncLevel3MediaPermissionsForGuild
};
