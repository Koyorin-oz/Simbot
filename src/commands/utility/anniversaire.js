const {
  SlashCommandBuilder,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("anniversaire")
    .setDescription("Enregistre ta date d'anniversaire (JJ/MM ou JJ/MM/AAAA)"),
  async execute(client, interaction) {
    const modal = new ModalBuilder()
      .setCustomId("birthday_set_modal")
      .setTitle("Mon anniversaire 🎂");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("birthday_input")
          .setLabel("Date (JJ/MM ou JJ/MM/AAAA)")
          .setPlaceholder("Ex: 01/01 ou 01/01/2010")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
  }
};
