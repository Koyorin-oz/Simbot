const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const ms = require("ms");
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const { buildSanctionEmbed } = require("../../utils/sanctionEmbed");
const { deferPublic } = require("../../utils/slashDefer");
const { assertCanSanctionMember } = require("../../utils/staffSanctionHierarchy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute via timeout natif")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre cible").setRequired(true))
    .addStringOption(o => o.setName("duree").setDescription("Ex: 10m, 1h").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison").setRequired(false)),
  async execute(client, interaction) {
    await deferPublic(interaction);

    const targetUser = interaction.options.getUser("membre", true);
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    const durationRaw = interaction.options.getString("duree", true);
    const reason = interaction.options.getString("raison") || "Aucune raison";
    const duration = ms(durationRaw);
    if (!member) return interaction.editReply({ content: "Membre introuvable sur ce serveur." });
    const hierarchyFail = assertCanSanctionMember(
      interaction.member,
      member,
      interaction.guild,
      interaction.user.id
    );
    if (hierarchyFail) {
      await interaction.editReply({ content: hierarchyFail });
      return;
    }
    if (member.id === interaction.user.id) return interaction.editReply({ content: "Tu ne peux pas te mute toi-meme." });
    if (member.user.bot) return interaction.editReply({ content: "Impossible de mute un bot." });
    if (!member.moderatable) return interaction.editReply({ content: "Je ne peux pas mute ce membre (hierarchie/permissions)." });
    if (!duration || duration < 1000) return interaction.editReply({ content: "Duree invalide. Exemple: 10m, 1h, 2d." });
    if (duration > MAX_TIMEOUT_MS) return interaction.editReply({ content: "Duree trop longue (max 28 jours)." });

    await member.timeout(duration, reason);
    await client.prisma.punishment.create({
      data: {
        guildId: interaction.guildId,
        userId: member.id,
        moderatorId: interaction.user.id,
        type: "MUTE",
        reason,
        expiresAt: new Date(Date.now() + duration)
      }
    });
    const endsAt = new Date(Date.now() + duration);
    const embed = buildSanctionEmbed({
      title: interaction.guild.name,
      targetLabel: `${member} (${member.user.tag})`,
      reason,
      moderatorLabel: `${interaction.user} (${interaction.user.tag})`,
      endsAt
    });
    await interaction.editReply({ embeds: [embed] });
  }
};
