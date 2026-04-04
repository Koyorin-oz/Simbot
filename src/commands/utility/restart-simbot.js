const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { unfreezeSimBot, readState } = require("../../services/simbotRuntimeService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("restart-simbot")
    .setDescription("Re-active SimBot apres un arret gele")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(client, interaction) {
    const current = readState();
    if (!current.frozen) {
      await interaction.reply({ content: "SimBot est deja actif (pas gele).", flags: MessageFlags.Ephemeral });
      return;
    }
    unfreezeSimBot();
    await interaction.reply({
      content: "✅ SimBot est re-active. Les commandes et automatisations sont de nouveau actives.",
      flags: MessageFlags.Ephemeral
    });
  }
};
