const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { buildDebannissementInfoMessage } = require("../../utils/ticketPanels");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("panel-deban")
    .setDescription("Envoie le panneau débannissement (embed + bannière tickets) dans ce salon")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(client, interaction) {
    const payload = buildDebannissementInfoMessage();
    await interaction.channel.send({
      embeds: payload.embeds,
      files: payload.files,
      allowedMentions: { parse: [] }
    });
    await interaction.reply({
      content: "Panneau débannissement envoyé.",
      flags: MessageFlags.Ephemeral
    });
  }
};
