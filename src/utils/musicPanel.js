const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

/** Accent orange fonce (panneau musique). */
const MUSIC_ACCENT = 0xcc5500;

const MUSIC_V2 = {
  flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressEmbeds,
  embeds: []
};

/**
 * Grand panneau musique — boutons suffixes par userId (seul l’auteur peut cliquer).
 * @param {string} userId
 */
function buildMusicPanelPayload(userId) {
  const id = String(userId);
  const lines = [
    "## Panneau musique",
    "",
    "**Rechercher** : ouvre un formulaire — le bot propose les **meilleurs resultats YouTube + Spotify** (si configure).",
    "**Coller un lien** : URL YouTube ou Spotify (playlist / album / morceau).",
    "**Historique** : tes morceaux deja joues sur ce serveur — choisis-en un pour le remettre en file.",
    "**File** : file d’attente actuelle du serveur (pas ton historique).",
    "",
    "Tu dois etre dans un **salon vocal** pour lancer la lecture. Les boutons ne reagissent que pour **toi**."
  ].join("\n");

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
    new ButtonBuilder()
      .setCustomId(`music_pb:saveurl:${id}`)
      .setLabel("Enregistrer lien Spotify (voc prive)")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`music_pb:refresh:${id}`)
      .setLabel("Rafraichir le panneau")
      .setStyle(ButtonStyle.Secondary)
  );

  const container = new ContainerBuilder()
    .setAccentColor(MUSIC_ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(row1)
    .addActionRowComponents(row2)
    .addActionRowComponents(row3);

  return { components: [container], ...MUSIC_V2 };
}

module.exports = { buildMusicPanelPayload, MUSIC_ACCENT, MUSIC_V2 };
