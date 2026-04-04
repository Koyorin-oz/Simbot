const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { freezeSimBot, readState } = require("../../services/simbotRuntimeService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("arreter-simbot")
    .setDescription("Arret total de SimBot (commande admin)")
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
    if (current.frozen) {
      await interaction.reply({
        content: "SimBot est deja en mode arrete (gele). Utilise `/restart-simbot` pour re-activer.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const confirm = String(interaction.options.getString("confirmer", true) || "")
      .trim()
      .toUpperCase();
    if (confirm !== "OUI") {
      await interaction.reply({
        content: "Confirmation invalide. Ecris exactement `OUI` pour arreter SimBot.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    freezeSimBot();
    await interaction.reply({
      content:
        "SimBot est maintenant en mode arrete (gele): il reste en ligne mais n'executera plus les actions sensibles jusqu'a `/restart-simbot`.",
      flags: MessageFlags.Ephemeral
    });
  }
};
