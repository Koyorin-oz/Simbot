const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { buildSanctionEmbed } = require("../../utils/sanctionEmbed");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("debannir")
    .setDescription("Deban un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) =>
      o.setName("userid").setDescription("ID utilisateur a deban").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("raison").setDescription("Raison du deban").setRequired(false)
    ),
  async execute(client, interaction) {
    const userId = interaction.options.getString("userid", true).trim();
    const reason = interaction.options.getString("raison") || "Aucune raison";
    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({ content: "ID utilisateur invalide.", flags: MessageFlags.Ephemeral });
      return;
    }

    await deferPublic(interaction);

    const existingBan = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!existingBan) {
      await interaction.editReply({
        content: "Impossible de debannir: cet utilisateur n'est pas banni (ou ID introuvable)."
      });
      return;
    }

    try {
      await interaction.guild.members.unban(userId, reason);
    } catch (error) {
      if (error?.code === 10013) {
        await interaction.editReply({
          content: "Impossible de debannir: utilisateur inconnu (ID invalide ou deja debanni)."
        });
        return;
      }
      throw error;
    }

    await client.prisma.punishment.create({
      data: {
        guildId: interaction.guildId,
        userId,
        moderatorId: interaction.user.id,
        type: "DEBAN",
        reason
      }
    });
    const embed = buildSanctionEmbed({
      title: interaction.guild.name,
      targetLabel: `<@${userId}> (${userId})`,
      reason,
      moderatorLabel: `${interaction.user} (${interaction.user.tag})`
    });
    await interaction.editReply({ embeds: [embed] });
  }
};
