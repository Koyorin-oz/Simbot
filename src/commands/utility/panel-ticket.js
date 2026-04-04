const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("../../config");
const { buildTicketPanelMessage } = require("../../utils/ticketPanels");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("panel-ticket")
    .setDescription("Affiche le panneau d'ouverture de tickets (Components V2)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(client, interaction) {
    const intro = config.tickets?.panelEmbedIntro || "Besoin d'aide ? Ouvre un ticket ci-dessous.";
    const panel = buildTicketPanelMessage(intro, { variant: "general" });
    await interaction.reply(panel);
  }
};
