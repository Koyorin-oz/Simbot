const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { getGuildVisibility, buildVisibilityMenu } = require("../../services/commandVisibilityService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("desactiver")
    .setDescription("Ouvre le menu pour activer/desactiver des categories de commandes")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(client, interaction) {
    const state = getGuildVisibility(interaction.guildId);
    const menu = buildVisibilityMenu(state);
    await interaction.reply({
      ...menu,
      flags: MessageFlags.Ephemeral
    });
  }
};
