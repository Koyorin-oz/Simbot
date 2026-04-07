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
 * @param {{ pingUser?: boolean }} [opts] - si pingUser, mention au debut (obligatoire avec Components V2 : pas de `content` separe)
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

  return { components: [container], ...V2_MSG };
}

module.exports = { buildPrivateRoomPanel };
