const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require("discord.js");
const { buildMusicPanelPayload, buildBlzMusicSessionAdapter } = require("../../utils/musicPanel");
const musicService = require("../../services/musicService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("music-panel")
    .setDescription("[Admin] Affiche le panneau musique BLZ dans ce salon texte.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(_client, interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: "Sur un serveur uniquement.", flags: MessageFlags.Ephemeral });
    }
    const ch = interaction.channel;
    if (!ch?.isTextBased?.() || typeof ch.send !== "function") {
      return interaction.reply({
        content: "Utilise cette commande dans un salon **texte**.",
        flags: MessageFlags.Ephemeral
      });
    }
    if (!musicService.isEnabled()) {
      return interaction.reply({
        content: "La musique est desactivee sur ce bot.",
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const gid = interaction.guild.id;
    const payload = {
      content: "🎵 **Panneau musique** — tout le monde peut utiliser les boutons ci-dessous.",
      ...buildMusicPanelPayload(gid, buildBlzMusicSessionAdapter(gid))
    };
    try {
      const msg = await ch.send(payload);
      if (msg?.id) musicService.registerMusicPanelMessage(gid, msg.channelId, msg.id);
    } catch (e) {
      return interaction.editReply({
        content: `Impossible d’envoyer le panneau : ${e?.message || "erreur"}.`
      });
    }
    return interaction.editReply({ content: "Panneau musique envoyé." });
  }
};
