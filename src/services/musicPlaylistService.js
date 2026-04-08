"use strict";

/** Capacite max par membre / serveur. */
const MAX_ITEMS = 60;

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} guildId
 * @param {string} userId
 */
async function listUserPlaylist(prisma, guildId, userId) {
  if (!prisma?.musicPlaylistItem?.findMany) return [];
  return prisma.musicPlaylistItem.findMany({
    where: { guildId: String(guildId), userId: String(userId) },
    orderBy: { sortOrder: "asc" }
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} guildId
 * @param {string} userId
 * @param {Array<{ title: string, url: string }>} tracks
 */
async function addTracksToUserPlaylist(prisma, guildId, userId, tracks) {
  if (!prisma?.musicPlaylistItem?.createMany) {
    return { error: "Base de donnees indisponible." };
  }
  const gid = String(guildId);
  const uid = String(userId);
  const count = await prisma.musicPlaylistItem.count({ where: { guildId: gid, userId: uid } });
  const room = MAX_ITEMS - count;
  if (room <= 0) {
    return {
      error: `Playlist pleine (${MAX_ITEMS} titres max). Retire des morceaux avec le menu **Retirer**.`
    };
  }
  const toAdd = tracks.slice(0, room);
  if (!toAdd.length) return { error: "Aucun morceau a ajouter." };

  const agg = await prisma.musicPlaylistItem.aggregate({
    where: { guildId: gid, userId: uid },
    _max: { sortOrder: true }
  });
  let start = (agg._max.sortOrder ?? 0) + 1;

  await prisma.musicPlaylistItem.createMany({
    data: toAdd.map((t, i) => ({
      guildId: gid,
      userId: uid,
      title: String(t.title).slice(0, 400),
      url: String(t.url).slice(0, 500),
      sortOrder: start + i
    }))
  });
  return { ok: true, added: toAdd.length, skipped: tracks.length - toAdd.length };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} guildId
 * @param {string} userId
 * @param {number} itemId
 */
async function removePlaylistItem(prisma, guildId, userId, itemId) {
  if (!prisma?.musicPlaylistItem?.deleteMany) return false;
  const r = await prisma.musicPlaylistItem.deleteMany({
    where: {
      id: Number(itemId),
      guildId: String(guildId),
      userId: String(userId)
    }
  });
  return r.count > 0;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} guildId
 * @param {string} userId
 */
async function clearUserPlaylist(prisma, guildId, userId) {
  if (!prisma?.musicPlaylistItem?.deleteMany) return;
  await prisma.musicPlaylistItem.deleteMany({
    where: { guildId: String(guildId), userId: String(userId) }
  });
}

/**
 * Texte + composants pour message ephemere (liste + actions).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} guildId
 * @param {string} userId
 */
async function buildPlaylistPanelPayload(prisma, guildId, userId) {
  const items = await listUserPlaylist(prisma, guildId, userId);
  const {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
  } = require("discord.js");

  const show = items.slice(0, 40);
  const body = show
    .map((it, i) => `${i + 1}. ${String(it.title).replace(/\n/g, " ").slice(0, 92)}`)
    .join("\n");
  const extra =
    items.length > 40 ? `\n_… et ${items.length - 40} autre(s) (non affiche(s) ici)._` : "";
  const content =
    `**Ta playlist** — ${items.length} titre(s) sur ce serveur\n` +
    `_Les morceaux sont joues sur YouTube comme le reste du bot._\n\n` +
    (body || "_Playlist vide — clique **Ajouter un titre**._") +
    extra;
  const safeContent = content.slice(0, 3900);

  const rows = [];
  const forSelect = items.slice(0, 25);
  if (forSelect.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`music_pldel:${userId}`)
          .setPlaceholder("Retirer un titre de ta playlist")
          .addOptions(
            forSelect.map((it) => ({
              label: String(it.title).replace(/\n/g, " ").slice(0, 100),
              description: String(it.url).replace(/^https?:\/\//, "").slice(0, 100),
              value: String(it.id)
            }))
          )
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`music_pb:pladd:${userId}`)
        .setLabel("Ajouter un titre")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`music_pb:plplay:${userId}`)
        .setLabel("Tout jouer")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`music_pb:plclr:${userId}`)
        .setLabel("Vider")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`music_pb:plref:${userId}`)
        .setLabel("Rafraichir")
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { content: safeContent, components: rows, itemCount: items.length };
}

module.exports = {
  MAX_ITEMS,
  listUserPlaylist,
  addTracksToUserPlaylist,
  removePlaylistItem,
  clearUserPlaylist,
  buildPlaylistPanelPayload
};
