const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { buildMusicPanelPayload } = require("../../utils/musicPanel");
const musicService = require("../../services/musicService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("music")
    .setDescription("Ouvre le panneau musique (raccourci — bouton MUSIQUE sur le panneau vocal prive)"),
  async execute(_client, interaction) {
    if (!musicService.isEnabled()) {
      await interaction.reply({
        content: "La musique est desactivee sur ce bot.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    await interaction.reply(buildMusicPanelPayload(interaction.user.id, interaction.guildId));
  }
};
