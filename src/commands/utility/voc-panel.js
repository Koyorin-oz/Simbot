const { SlashCommandBuilder, ChannelType, MessageFlags, PermissionFlagsBits } = require("discord.js");
const config = require("../../config");
const { buildVocPanelOpenerPayload } = require("../../utils/voiceRoomPanelBLZ");
const { getPrivateRoomVoiceMeta } = require("../../services/privateRoomService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("voc-panel")
    .setDescription("[Admin] Publie le message « Ouvrir mon panneau » (interface BLZ).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) =>
      opt
        .setName("vocal")
        .setDescription("Optionnel : panneau pour un vocal précis (créateur / staff)")
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(false)
    ),

  async execute(_client, interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: "Sur un serveur uniquement.", flags: MessageFlags.Ephemeral });
    }
    const postChannel = interaction.channel;
    if (!postChannel?.send) {
      return interaction.reply({
        content: "Utilise cette commande dans un salon texte où le bot peut écrire.",
        flags: MessageFlags.Ephemeral
      });
    }
    const pr = config.privateRoom;
    if (!pr?.enabled) {
      return interaction.reply({
        content: "Les salons vocaux privés ne sont pas activés.",
        flags: MessageFlags.Ephemeral
      });
    }

    const voiceOpt = interaction.options.getChannel("vocal");
    if (voiceOpt) {
      if (!voiceOpt.isVoiceBased?.()) {
        return interaction.reply({ content: "Choisis un salon **vocal**.", flags: MessageFlags.Ephemeral });
      }
      if (String(voiceOpt.parentId || "") !== String(pr.voiceCategoryId || "")) {
        return interaction.reply({
          content: "Mauvaise catégorie pour ce vocal privé.",
          flags: MessageFlags.Ephemeral
        });
      }
      const meta = getPrivateRoomVoiceMeta(interaction.client, voiceOpt.id);
      if (!meta || meta.guildId !== interaction.guild.id) {
        return interaction.reply({
          content: "Ce vocal n’est pas enregistré comme salon privé du bot.",
          flags: MessageFlags.Ephemeral
        });
      }
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await postChannel.send(buildVocPanelOpenerPayload(voiceOpt?.id ?? null));
    } catch (e) {
      return interaction.editReply({
        content: `Impossible d’envoyer le message : ${e?.message || "erreur"}.`
      });
    }
    return interaction.editReply({
      content: voiceOpt
        ? "Message publié — panneau pour ce vocal (éphémère au clic)."
        : "Message publié — **Ouvrir mon panneau** pour chaque membre."
    });
  }
};
