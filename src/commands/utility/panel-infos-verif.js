const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { buildVerificationHelpInfoMessage } = require("../../utils/ticketPanels");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("panel-infos-verif")
    .setDescription(
      "Envoie le panneau d'aide (téléphone Discord + montrer tous les salons, embed + bannière)"
    )
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(client, interaction) {
    const payload = buildVerificationHelpInfoMessage();
    await interaction.channel.send({
      embeds: payload.embeds,
      files: payload.files,
      allowedMentions: { parse: [] }
    });
    await interaction.reply({
      content: "Panneau d'informations envoyé.",
      flags: MessageFlags.Ephemeral
    });
  }
};
