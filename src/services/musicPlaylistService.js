"use strict";

/** Capacite max par membre / serveur. */
const MAX_ITEMS = 60;

/** Titre en base pour les morceaux venus de Spotify (audio = YouTube derriere). */
const SPOTIFY_STORED_TITLE_PREFIX = "🟢 Spotify · ";

/**
 * @param {{ title: string, url: string }} it
 * @returns {{ title: string, url: string, spotifyCosplay: boolean }}
 */
function playlistItemToQueueTrack(it) {
  const t = String(it?.title || "");
  if (t.startsWith(SPOTIFY_STORED_TITLE_PREFIX)) {
    return {
      title: t.slice(SPOTIFY_STORED_TITLE_PREFIX.length).trim() || t,
      url: it.url,
      spotifyCosplay: true
    };
  }
  return { title: t, url: it.url, spotifyCosplay: false };
}

function cleanTitleForSpotifyStorage(title) {
  return String(title || "")
    .replace(new RegExp(`^${SPOTIFY_STORED_TITLE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "")
    .trim();
}

function storedTitleForSpotifyPlaylist(cleanTitle) {
  const c = cleanTitleForSpotifyStorage(cleanTitle);
  return `${SPOTIFY_STORED_TITLE_PREFIX}${c}`.slice(0, 400);
}
/** Options du menu deroulant (limite Discord). */
const SELECT_CAP = 25;

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
 * @param {number} itemId
 */
async function getOwnedPlaylistItem(prisma, guildId, userId, itemId) {
  if (!prisma?.musicPlaylistItem?.findFirst) return null;
  return prisma.musicPlaylistItem.findFirst({
    where: {
      id: Number(itemId),
      guildId: String(guildId),
      userId: String(userId)
    }
  });
}

/**
 * Quand un morceau commence (demandeur connu) : ajoute a la playlist si pas deja present (meme URL).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} guildId
 * @param {string} userId
 * @param {string} title
 * @param {string} url
 * @param {{ spotifyCosplay?: boolean }} [opts]
 */
async function autoAppendPlayedTrack(prisma, guildId, userId, title, url, opts = {}) {
  if (!prisma?.musicPlaylistItem?.create) return;
  const gid = String(guildId);
  const uid = String(userId);
  if (!/^\d{17,20}$/.test(uid)) return;
  const u = String(url || "").trim().slice(0, 500);
  if (!u) return;
  const exists = await prisma.musicPlaylistItem.findFirst({
    where: { guildId: gid, userId: uid, url: u }
  });
  if (exists) return;
  const count = await prisma.musicPlaylistItem.count({ where: { guildId: gid, userId: uid } });
  if (count >= MAX_ITEMS) return;
  const agg = await prisma.musicPlaylistItem.aggregate({
    where: { guildId: gid, userId: uid },
    _max: { sortOrder: true }
  });
  const sortOrder = (agg._max.sortOrder ?? 0) + 1;
  const spotify = Boolean(opts.spotifyCosplay);
  const storeTitle = spotify
    ? storedTitleForSpotifyPlaylist(title)
    : cleanTitleForSpotifyStorage(title).slice(0, 400);
  await prisma.musicPlaylistItem.create({
    data: {
      guildId: gid,
      userId: uid,
      title: storeTitle,
      url: u,
      sortOrder
    }
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
      error: `Playlist pleine (${MAX_ITEMS} titres max). Retire des morceaux avec **Retirer**.`
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
 * @param {Array<{ id: number }>} items
 * @param {number | null | undefined} selectedItemId
 */
function resolveSelectedItemId(items, selectedItemId) {
  if (!items.length) return null;
  const sid = Number(selectedItemId);
  if (Number.isFinite(sid) && items.some((x) => x.id === sid)) return sid;
  return items[0].id;
}

/**
 * Message ephemere : liste complete + menu + actions sur la piste selectionnee.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} guildId
 * @param {string} userId
 * @param {number | null} [selectedItemId]
 */
async function buildPlaylistPanelPayload(prisma, guildId, userId, selectedItemId = null) {
  const items = await listUserPlaylist(prisma, guildId, userId);
  const {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
  } = require("discord.js");

  const selId = resolveSelectedItemId(items, selectedItemId);
  const selected = selId ? items.find((x) => x.id === selId) : null;

  let content;
  if (!items.length) {
    content = [
      "## Ta playlist (ce serveur)",
      "",
      "Les morceaux lances depuis **Spotify** (lien / recherche) sont aussi ajoutes ici avec **🟢 Spotify ·** — meme playlist, audio YouTube.",
      "",
      "**0 titre** pour l’instant.",
      "",
      "Dès que **tu** lances un morceau avec le bot (recherche, lien, historique, « Tout jouer », etc.), il est **ajouté ici automatiquement** — **sans doublon** si l’URL est déjà dans la liste.",
      "",
      "Tu peux aussi enregistrer des titres à la main avec **Ajouter un titre**.",
      "",
      "_Ce message est visible **uniquement par toi**._"
    ].join("\n");
  } else {
    const lines = items.map((it, i) => {
      const mark = it.id === selId ? " **→**" : "";
      return `${i + 1}. ${String(it.title).replace(/\n/g, " ").slice(0, 200)}${mark}`;
    });
    const body = lines.join("\n");
    const tail =
      items.length > SELECT_CAP
        ? `\n\n_Menu ci-dessous : **${SELECT_CAP}** premiers titres. Pour les autres, utilise **Rafraîchir** après en avoir retiré._`
        : "";
    content =
      `## Ta playlist — **${items.length}** titre(s) (serveur)\n` +
      `_**🟢 Spotify ·** = morceau ajouté depuis Spotify (le bot lit quand même via **YouTube**)._\n` +
      `_Piste sélectionnée (flèche **→**) : actions **Jouer** / **File** / **Retirer**._\n\n` +
      `${body.slice(0, 3600)}${tail}\n\n` +
      `_Visible uniquement par toi._`;
  }

  const safeContent = content.slice(0, 3900);
  const rows = [];

  if (items.length) {
    const forSelect = items.slice(0, SELECT_CAP);
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`music_plpick:${userId}`)
          .setPlaceholder("Choisir une musique dans la liste")
          .addOptions(
            forSelect.map((it, i) => ({
              label: `${i + 1}. ${String(it.title).replace(/\n/g, " ").slice(0, 80)}`,
              description: String(it.url).replace(/^https?:\/\//, "").slice(0, 100),
              value: String(it.id)
            }))
          )
      )
    );

    if (selected) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`music_ppa:${userId}:${selected.id}:j`)
            .setLabel("Jouer maintenant")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`music_ppa:${userId}:${selected.id}:q`)
            .setLabel("Mettre en file")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`music_ppa:${userId}:${selected.id}:r`)
            .setLabel("Retirer")
            .setStyle(ButtonStyle.Secondary)
        )
      );
    }
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
        .setStyle(ButtonStyle.Success)
        .setDisabled(!items.length),
      new ButtonBuilder()
        .setCustomId(`music_pb:plclr:${userId}`)
        .setLabel("Vider")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!items.length),
      new ButtonBuilder()
        .setCustomId(`music_pb:plref:${userId}`)
        .setLabel("Rafraichir")
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { content: safeContent, components: rows, itemCount: items.length, selectedId: selId };
}

module.exports = {
  MAX_ITEMS,
  SELECT_CAP,
  SPOTIFY_STORED_TITLE_PREFIX,
  playlistItemToQueueTrack,
  listUserPlaylist,
  getOwnedPlaylistItem,
  autoAppendPlayedTrack,
  addTracksToUserPlaylist,
  removePlaylistItem,
  clearUserPlaylist,
  buildPlaylistPanelPayload,
  resolveSelectedItemId
};
