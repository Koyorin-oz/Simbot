const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { buildMusicPanelPayload, buildBlzMusicSessionAdapter } = require("../../utils/musicPanel");
const musicService = require("../../services/musicService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("music")
    .setDescription("Ouvre le panneau musique BLZ (même interface que dans les vocaux privés)"),
  async execute(_client, interaction) {
    if (!musicService.isEnabled()) {
      await interaction.reply({
        content: "La musique est desactivee sur ce bot.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const gid = interaction.guildId;
    const payload = buildMusicPanelPayload(gid, buildBlzMusicSessionAdapter(gid));
    const msg = await interaction.reply({ ...payload, fetchReply: true });
    if (msg?.id && msg.channelId) {
      musicService.registerMusicPanelMessage(gid, msg.channelId, msg.id);
    }
  }
};
