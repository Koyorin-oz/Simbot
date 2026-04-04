const {SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder, MessageFlags} = require("discord.js");
const { MODAL_CUSTOM_ID, canViewAndVoteSuggestions } = require("../../services/suggestionService");
module.exports = {
  data: new SlashCommandBuilder()
    .setName("suggestion")
    .setDescription("Proposer une idée — le salon 💡 suggestions est créé auto si besoin (bot : gérer les salons)")
    .setDMPermission(false),
  async execute(client, interaction) {
    if (!interaction.inGuild() || !interaction.member) {
      await interaction.reply({ content: "Utilisable uniquement sur un serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!canViewAndVoteSuggestions(interaction.member)) {
      await interaction.reply({
        content:
          "Réservé aux **membres vérifiés** ou au **staff** (rôle `suggestions.staffRoleId` / permissions modération).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const modal = new ModalBuilder().setCustomId(MODAL_CUSTOM_ID).setTitle("Nouvelle suggestion");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("sg_title")
          .setLabel("Titre")
          .setStyle(TextInputStyle.Short)
          .setMinLength(3)
          .setMaxLength(100)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("sg_body")
          .setLabel("Ta suggestion")
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(2000)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("sg_image")
          .setLabel("URL image (optionnel)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(500)
          .setRequired(false)
          .setPlaceholder("https://…")
      )
    );

    await interaction.showModal(modal);
  }
};
