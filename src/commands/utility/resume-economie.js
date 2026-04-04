const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { resumeEconomy, readState } = require("../../services/economyRuntimeService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("resume-economie")
    .setDescription("Reprend l'economie (SC SP LP)")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(client, interaction) {
    const current = readState();
    if (!current.paused) {
      await interaction.reply({
        content: "L'economie est deja active.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    resumeEconomy();
    await interaction.reply({
      content: "✅ Economie reactivee: les gains/modifications **SC / SP / LP** sont de nouveau autorises.",
      flags: MessageFlags.Ephemeral
    });
  }
};
