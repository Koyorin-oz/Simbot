const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { pauseEconomy, readState } = require("../../services/economyRuntimeService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pause-economie")
    .setDescription("Pause totalement les gains/modifications SC SP LP")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName("confirmer")
        .setDescription("Ecris exactement OUI pour confirmer")
        .setRequired(true)
    ),
  async execute(client, interaction) {
    const current = readState();
    if (current.paused) {
      await interaction.reply({
        content: "L'economie est deja en pause.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const confirm = String(interaction.options.getString("confirmer", true) || "")
      .trim()
      .toUpperCase();
    if (confirm !== "OUI") {
      await interaction.reply({
        content: "Confirmation invalide. Ecris exactement `OUI` pour mettre en pause.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    pauseEconomy();
    await interaction.reply({
      content:
        "⏸️ Economie en pause: toutes les modifications de **SC / SP / LP** sont bloquees jusqu'a `/resume-economie`.",
      flags: MessageFlags.Ephemeral
    });
  }
};
