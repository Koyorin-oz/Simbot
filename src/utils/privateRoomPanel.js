const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const { V2_MSG, ACCENT_COLOR } = require("./componentsV2Panels");

/**
 * @param {boolean} hasChannel
 * @param {string} prefsSummary
 * @param {string} ownerId - ID Discord : suffixed aux customId pour que seul le proprietaire puisse cliquer
 * @param {{
 *   pingUser?: boolean,
 *   panelTextChannelId?: string | null,
 *   lobbyChannelId?: string | null,
 *   musicEnabled?: boolean,
 *   musicSpotifyUrl?: string
 * }} [opts] - si pingUser, mention au debut (obligatoire avec Components V2 : pas de `content` separe)
 */
function buildPrivateRoomPanel(hasChannel, prefsSummary, ownerId, opts = {}) {
  const id = String(ownerId);
  const head = opts.pingUser ? `<@${id}>\n\n` : "";
  const panelHint =
    opts.panelTextChannelId && opts.lobbyChannelId
      ? `Rejoins <#${opts.lobbyChannelId}> (**Creer votre salon**) : tu seras place dans ton vocal prive et le panneau sera dans le chat de cette voc.`
      : "Rejoins le vocal **Creer votre salon** : tu seras place dans ton vocal prive et le panneau sera dans le chat de la voc.";
  const lines = [
    `${head}## Salons vocaux prives`,
    panelHint,
    "",
    hasChannel
      ? "Tu as un salon actif. Utilise **Configurer mon salon** pour appliquer nom, places, mode et listes sur ce vocal (sans en creer un autre)."
      : "Utilise **Creer mon salon** pour ouvrir le formulaire (nom, places, mode open / listes).",
    "",
    prefsSummary || "",
    "",
    "*Seul le membre mentionne peut utiliser les boutons de ce message.*"
  ].join("\n");

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`prv_create:${id}`)
      .setLabel(hasChannel ? "Configurer mon salon" : "Creer mon salon")
      .setStyle(ButtonStyle.Success)
      .setDisabled(false),
    new ButtonBuilder()
      .setCustomId(`prv_rename:${id}`)
      .setLabel("Renommer")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasChannel),
    new ButtonBuilder()
      .setCustomId(`prv_limit:${id}`)
      .setLabel("Places max")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasChannel)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`prv_bl:${id}`).setLabel("Liste noire").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`prv_wl:${id}`).setLabel("Liste blanche").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`prv_refresh:${id}`).setLabel("Rafraichir").setStyle(ButtonStyle.Secondary)
  );

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(row1)
    .addActionRowComponents(row2);

  if (opts.musicEnabled) {
    const savedOk = Boolean(String(opts.musicSpotifyUrl || "").trim());
    const musicHint =
      "**Musique** : le bot rejoint ton vocal et lit via YouTube (lien ou recherche). " +
      "Liens **Spotify publics** (morceau / album / playlist) si l’API est configuree sur le bot. " +
      "Enregistre un lien avec `/music definir-lien` pour le bouton **Ma playlist**.";
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(musicHint));

    const rowMusic1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`prv_music_join:${id}`)
        .setLabel("Musique : rejoindre")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!hasChannel),
      new ButtonBuilder()
        .setCustomId(`prv_music_play:${id}`)
        .setLabel("Musique : jouer")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!hasChannel),
      new ButtonBuilder()
        .setCustomId(`prv_music_saved:${id}`)
        .setLabel("Ma playlist")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!hasChannel || !savedOk),
      new ButtonBuilder()
        .setCustomId(`prv_music_queue:${id}`)
        .setLabel("File")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasChannel),
      new ButtonBuilder()
        .setCustomId(`prv_music_skip:${id}`)
        .setLabel("Skip")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasChannel)
    );
    const rowMusic2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`prv_music_leave:${id}`)
        .setLabel("Musique : quitter le vocal")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!hasChannel)
    );
    const rowMusic3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`prv_music_pause:${id}`)
        .setLabel("Pause")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasChannel),
      new ButtonBuilder()
        .setCustomId(`prv_music_resume:${id}`)
        .setLabel("Reprendre")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!hasChannel),
      new ButtonBuilder()
        .setCustomId(`prv_music_restart:${id}`)
        .setLabel("Depuis le debut")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasChannel),
      new ButtonBuilder()
        .setCustomId(`prv_music_voldown:${id}`)
        .setLabel("Son -")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasChannel),
      new ButtonBuilder()
        .setCustomId(`prv_music_volup:${id}`)
        .setLabel("Son +")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasChannel)
    );
    container.addActionRowComponents(rowMusic1).addActionRowComponents(rowMusic2).addActionRowComponents(rowMusic3);
  }

  return { components: [container], ...V2_MSG };
}

module.exports = { buildPrivateRoomPanel };
