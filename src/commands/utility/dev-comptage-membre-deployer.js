const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const config = require("../../config");
const { updateMemberCounterChannel } = require("../../services/memberCounterService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dev-comptage-membre-deployer")
    .setDescription("Deploie ou met a jour le compteur de membres")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option
        .setName("salon")
        .setDescription("Salon a utiliser pour le compteur de membres")
        .setRequired(false)
    ),
  async execute(client, interaction) {
    const selectedChannel = interaction.options.getChannel("salon", false);
    if (selectedChannel) {
      config.serverStats.memberCounterChannelId = selectedChannel.id;
    }

    const result = await updateMemberCounterChannel(interaction.guild);
    if (!result?.ok) {
      const reasonMap = {
        guild_missing: "Serveur introuvable.",
        channel_id_missing: "Aucun salon compteur configure.",
        channel_not_found: "Salon compteur introuvable. Passe l'option `salon`."
      };
      await interaction.reply({
        content: `Impossible de deployer le compteur: ${reasonMap[result?.reason] || "erreur inconnue."}`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply({
      content: result.changed
        ? "Compteur de membres deployee et mis a jour."
        : "Compteur de membres deja a jour.",
      flags: MessageFlags.Ephemeral
    });
  }
};
