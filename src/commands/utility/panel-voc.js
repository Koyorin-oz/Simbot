const { SlashCommandBuilder, ChannelType, MessageFlags } = require("discord.js");
const config = require("../../config");
const { PermissionFlagsBits } = require("discord.js");
const { buildPrivateVoicePanelPayload, getPrivateRoomStaffRoleId } = require("../../utils/voiceRoomPanelBLZ");
const { getPrivateRoomVoiceMeta, getOrInitSession } = require("../../services/privateRoomService");

function canUsePanel(interaction, voiceChannelId, restricted) {
  const member = interaction.member;
  if (!member || !interaction.guild) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const meta = getPrivateRoomVoiceMeta(interaction.client, voiceChannelId);
  if (!meta || meta.guildId !== interaction.guild.id) return false;
  const staffRole = getPrivateRoomStaffRoleId();
  const isStaff = staffRole ? member.roles.cache.has(staffRole) : false;
  if (restricted) return member.id === meta.ownerId || isStaff;
  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("panel-voc")
    .setDescription("Affiche le panneau BLZ d’un salon vocal privé dans ce salon texte.")
    .addChannelOption((opt) =>
      opt
        .setName("vocal")
        .setDescription("Salon vocal privé (défaut : ton vocal actuel)")
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(false)
    ),

  async execute(_client, interaction) {
    const postChannel = interaction.channel;
    if (!interaction.guild || !postChannel?.send) {
      return interaction.reply({
        content: "Utilise cette commande sur le serveur, dans un salon où le bot peut écrire.",
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

    let voiceCh = interaction.options.getChannel("vocal");
    if (!voiceCh) {
      const mid = interaction.member?.voice?.channelId;
      if (mid) voiceCh = await interaction.guild.channels.fetch(mid).catch(() => null);
    }
    if (!voiceCh?.isVoiceBased?.()) {
      const sess = await getOrInitSession(interaction.client, interaction.guild.id, interaction.user.id);
      if (sess?.voiceChannelId) {
        voiceCh = await interaction.guild.channels.fetch(sess.voiceChannelId).catch(() => null);
      }
    }
    if (!voiceCh?.isVoiceBased?.()) {
      return interaction.reply({
        content:
          "Indique un salon **vocal**, connecte-toi à ton privé, ou crée-en un via le lobby.",
        flags: MessageFlags.Ephemeral
      });
    }
    if (String(voiceCh.parentId || "") !== String(pr.voiceCategoryId || "")) {
      return interaction.reply({
        content: "Ce salon n’est pas un vocal privé géré par le bot (mauvaise catégorie).",
        flags: MessageFlags.Ephemeral
      });
    }
    const meta = getPrivateRoomVoiceMeta(interaction.client, voiceCh.id);
    if (!meta || meta.guildId !== interaction.guild.id) {
      return interaction.reply({
        content: "Ce vocal n’est pas enregistré comme salon privé du bot.",
        flags: MessageFlags.Ephemeral
      });
    }
    if (!canUsePanel(interaction, voiceCh.id, true)) {
      return interaction.reply({
        content: "Réservé au **créateur** du salon ou au **staff**.",
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.reply({
      content: `Panneau pour ${voiceCh}`,
      ...buildPrivateVoicePanelPayload(voiceCh.id, "restricted")
    });
  }
};
