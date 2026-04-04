const fs = require("node:fs");
const path = require("node:path");
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  AttachmentBuilder,
  EmbedBuilder
} = require("discord.js");
const { MediaGalleryBuilder, MediaGalleryItemBuilder } = require("@discordjs/builders");
const { ACCENT_COLOR } = require("./componentsV2Panels");
const config = require("../config");

const TICKET_BANNER_FILE = "ticket-banner.png";
const TICKET_BANNER_PATH = path.join(__dirname, "..", "..", "assets", TICKET_BANNER_FILE);

function getTicketBannerAttachment() {
  if (!fs.existsSync(TICKET_BANNER_PATH)) return null;
  return new AttachmentBuilder(TICKET_BANNER_PATH, { name: TICKET_BANNER_FILE });
}

/**
 * @param {string} introText
 * @param {{ variant?: "general" | "welcome" }} [opts]
 */
function buildTicketPanelMessage(introText, opts = {}) {
  const variant = opts.variant === "welcome" ? "welcome" : "general";
  const banner = getTicketBannerAttachment();

  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);

  if (banner) {
    const galDesc =
      variant === "welcome"
        ? "Tickets — processus d'accueil / verification"
        : "Services de tickets La Carminaute — Support / contact";
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setDescription(galDesc).setURL(`attachment://${TICKET_BANNER_FILE}`)
      )
    );
  }

  const heading =
    variant === "welcome"
      ? "## :ticket: Support — Processus d'accueil"
      : "## :ticket: Support — Tickets generaux";
  const buttonId = variant === "welcome" ? "ticket_open_prompt_welcome" : "ticket_open_prompt";
  const buttonLabel = variant === "welcome" ? "Ouvrir un ticket (verification)" : "Ouvrir un ticket";

  let body = introText;
  if (variant === "welcome") {
    const vId = String(config.ticketsWelcome?.verificationChannelId || "").trim();
    body = String(introText || "").replace(
      /\{\{VERIFY_CHANNEL\}\}/g,
      vId ? `<#${vId}>` : "le salon de verification"
    );
  }

  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${heading}\n${body}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(buttonId).setLabel(buttonLabel).setStyle(ButtonStyle.Primary)
      )
    );

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressEmbeds,
    embeds: []
  };
  if (banner) payload.files = [banner];
  return payload;
}

const APPEAL_FORM_URL = "https://appeal.gg/cddzPNX";

/** Message classique (embed) pour le salon : infos débannissement + bannière ticket en bas de l’embed. */
function buildDebannissementInfoMessage() {
  const banner = getTicketBannerAttachment();
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("📩 Demandes de débannissement")
    .setDescription(
      [
        `Voici le lien du **formulaire** pour les demandes de débannissement ⬇️`,
        `[**Ouvrir le formulaire**](${APPEAL_FORM_URL})`,
        "",
        "Ce lien vous sera automatiquement transmis en MP par **DraftBot** si vous êtes bannis.",
        "",
        "Nous attendons un minimum de sérieux de votre part, un français lisible et du respect. ✅",
        "",
        "L'équipe de modération n'est pas parfaite, vous êtes dans votre droit de contester un bannissement. ⚖️",
        "",
        "Nous acceptons rarement les demandes de débannissement. Donc retenez que si votre argumentation n'est pas soutenue, que vous n'êtes banni que depuis peu, ou que les faits reprochés sont très graves, il y a de fortes chances pour que nous ne vous prenions même pas en compte. 🚫",
        "",
        "Merci pour votre compréhension.",
        "",
        APPEAL_FORM_URL
      ].join("\n")
    )
    .setFooter({ text: "La Carminauté • Formulaire officiel" })
    .setTimestamp(new Date());

  if (banner) {
    embed.setImage(`attachment://${TICKET_BANNER_FILE}`);
  }

  return {
    embeds: [embed],
    files: banner ? [banner] : []
  };
}

/** Aide vérification téléphone + afficher tous les salons (embed + bannière ticket en bas). */
function buildVerificationHelpInfoMessage() {
  const banner = getTicketBannerAttachment();
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📱 Informations — Téléphone & salons")
    .setDescription(
      [
        "### Pour vérifier ton numéro de téléphone avec Discord",
        "La vérification d'un numéro de téléphone avec ton compte Discord est **nécessaire pour rejoindre le serveur**. Si ce n'est pas déjà fait, voici les étapes :",
        "",
        "**🖥️ PC / navigateur web**",
        "• Clique sur l'icône ⚙️ **Paramètres utilisateur** en bas à gauche, à côté de ton pseudo.",
        "• Dans le menu de gauche, va dans **Mon compte**.",
        "• Dans la section **Numéro de téléphone**, clique sur **Ajouter**.",
        "• Entre ton numéro de téléphone.",
        "• Discord envoie un **code par SMS** sur ce numéro.",
        "• Saisis le code reçu dans Discord.",
        "• Si le code est correct, ton numéro est **vérifié**.",
        "",
        "**📱 iOS / Android**",
        "• Appuie sur ta **photo de profil** en bas à droite pour ouvrir les paramètres.",
        "• Va dans **Mon compte**.",
        "• Appuie sur **Numéro de téléphone**, puis sur **Ajouter**.",
        "• Entre ton numéro de téléphone.",
        "• Discord envoie un **code par SMS** sur ce numéro.",
        "• Saisis le code reçu dans Discord.",
        "• Si le code est correct, ton numéro est **vérifié**.",
        "",
        "— — —",
        "",
        "### Pour voir tous les salons",
        "Ça permet de **voir tous les salons** du serveur. L'effet s'applique une fois la **vérification** faite (salon **🛂│vérification**).",
        "",
        "**🖥️ PC / navigateur web**",
        "• Clique sur l'icône **⬇️** en haut à gauche sur le serveur (à côté du nom du serveur).",
        "• Coche **Montrer tous les salons**.",
        "",
        "**📱 iOS / Android**",
        "• Clique sur le **nom du serveur** (juste en bas de la bannière).",
        "• Descends et active **Montrer tous les salons**."
      ].join("\n")
    )
    .setFooter({ text: "La Carminauté • Aide Discord" })
    .setTimestamp(new Date());

  if (banner) {
    embed.setImage(`attachment://${TICKET_BANNER_FILE}`);
  }

  return {
    embeds: [embed],
    files: banner ? [banner] : []
  };
}

function buildTicketStaffPanel(channelId) {
  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "## Gestion du ticket\n**Fermer** : le demandeur ou le staff (dont rôle moderateur). Les autres boutons sont **réservés au staff** (réouverture, transcript, membres)."
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_close:${channelId}`)
          .setLabel("Fermer le ticket")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`ticket_reopen:${channelId}`)
          .setLabel("Reouvrir le ticket")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ticket_tr_txt:${channelId}`)
          .setLabel("Transcript TXT")
          .setEmoji("📜")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`ticket_tr_html:${channelId}`)
          .setLabel("Transcript HTML")
          .setEmoji("📃")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`ticket_member_prompt:${channelId}`)
          .setLabel("Ajouter / Retirer")
          .setEmoji("👥")
          .setStyle(ButtonStyle.Primary)
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressEmbeds,
    embeds: []
  };
}

module.exports = {
  buildTicketPanelMessage,
  buildTicketStaffPanel,
  buildDebannissementInfoMessage,
  buildVerificationHelpInfoMessage,
  APPEAL_FORM_URL,
  getTicketBannerAttachment
};
