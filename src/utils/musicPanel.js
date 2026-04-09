const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

/** Accent orange fonce (panneau musique). */
const MUSIC_ACCENT = 0xcc5500;

/**
 * Grand panneau musique — boutons suffixes par userId (seul l’auteur peut cliquer, sauf bypass deja gere ailleurs).
 * Format classique (embed + boutons), pas Components V2.
 * @param {string} userId
 */
function buildMusicPanelPayload(userId) {
  const id = String(userId);
  const embed = new EmbedBuilder()
    .setColor(MUSIC_ACCENT)
    .setTitle("Panneau musique")
    .setDescription(
      [
        "**Rechercher** : formulaire — resultats **YouTube** + **Spotify** (si configure).",
        "**Coller un lien** : URL YouTube ou Spotify (playlist / album / morceau).",
        "**Historique** : tes morceaux deja joues sur ce serveur.",
        "**Playlist** : ta liste perso ; ajout manuel, lecture, retrait.",
        "**File** : file d’attente du serveur.",
        "**Pause / Reprendre / Depuis le debut** ; **Son - / Son +** : volume par pas de 10 %.",
        "",
        "**Enregistrer lien Spotify** : pour le bouton **Ma playlist** du panneau vocal prive.",
        "",
        "Tu dois etre dans un **salon vocal** pour lancer la lecture. Les boutons ne reagissent que pour **toi**."
      ].join("\n")
    )
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`music_pb:search:${id}`)
      .setLabel("Rechercher")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`music_pb:link:${id}`)
      .setLabel("Coller un lien")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`music_pb:hist:${id}`)
      .setLabel("Historique")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`music_pb:playlist:${id}`)
      .setLabel("Playlist")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`music_pb:queue:${id}`).setLabel("File").setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`music_pb:join:${id}`)
      .setLabel("Rejoindre mon vocal")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`music_pb:leave:${id}`)
      .setLabel("Quitter le vocal")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`music_pb:skip:${id}`).setLabel("Skip").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music_pb:stop:${id}`).setLabel("Stop").setStyle(ButtonStyle.Danger)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`music_pb:pause:${id}`).setLabel("Pause").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music_pb:resume:${id}`).setLabel("Reprendre").setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`music_pb:restart:${id}`)
      .setLabel("Depuis le debut")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music_pb:voldown:${id}`).setLabel("Son -").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music_pb:volup:${id}`).setLabel("Son +").setStyle(ButtonStyle.Secondary)
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`music_pb:saveurl:${id}`)
      .setLabel("Enregistrer lien Spotify")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`music_pb:refresh:${id}`)
      .setLabel("Rafraichir le panneau")
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

module.exports = { buildMusicPanelPayload, MUSIC_ACCENT };
