const {
  SlashCommandBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  MessageFlags
} = require("discord.js");
const config = require("../../config");

const VOTE_ALLOWED_ROLE_ID = "1401908829339390002";

function canUseVote(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.roles?.cache?.has(VOTE_ALLOWED_ROLE_ID)) return true;
  const suggestionsStaffRole = String(config.suggestions?.staffRoleId || "").trim();
  if (suggestionsStaffRole && member.roles?.cache?.has(suggestionsStaffRole)) return true;
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vote")
    .setDescription("Cree un vote interactif (popup)")
    .addChannelOption((o) =>
      o
        .setName("salon")
        .setDescription("Salon ou poster le vote (optionnel)")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),
  async execute(client, interaction) {
    if (!canUseVote(interaction.member)) {
      await interaction.reply({
        content: "Seuls les membres staff autorises peuvent creer et utiliser les votes.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetChannel = interaction.options.getChannel("salon") || interaction.channel;
    const me = interaction.guild.members.me;
    const perms = targetChannel.permissionsFor(me);
    const hasNeededPerms =
      perms?.has(PermissionFlagsBits.ViewChannel) &&
      perms?.has(PermissionFlagsBits.SendMessages) &&
      perms?.has(PermissionFlagsBits.ReadMessageHistory);

    if (!hasNeededPerms) {
      await interaction.reply({
        content: "Je n'ai pas les permissions requises dans ce salon (voir, envoyer, historique).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`vote:create:${targetChannel.id}`)
      .setTitle("Creer un vote");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("vote_question")
          .setLabel("Question du vote")
          .setStyle(TextInputStyle.Short)
          .setMinLength(5)
          .setMaxLength(180)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("vote_options")
          .setLabel("Options (une par ligne, 2 a 8)")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Oui\nNon\nPeut-etre")
          .setMinLength(3)
          .setMaxLength(900)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
  }
};
