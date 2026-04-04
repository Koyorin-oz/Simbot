const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { buildRepertoirePanelsMessage } = require("../../utils/repertoirePanelV2");
const { deferEphemeral } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("panel-repertoire")
    .setDescription(
      "Envoie les 2 panneaux V2 (répertoire Carminauté + privilèges des rôles) dans ce salon"
    )
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(client, interaction) {
    await deferEphemeral(interaction);
    await interaction.guild.roles.fetch().catch(() => null);
    const payload = buildRepertoirePanelsMessage(interaction.guild);
    await interaction.channel.send(payload);
    await interaction.editReply({
      content: "Les 2 panneaux répertoire ont été envoyés."
    });
  }
};
