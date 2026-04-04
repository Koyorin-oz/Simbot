const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildSanctionEmbed } = require("../../utils/sanctionEmbed");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("fin-silence")
    .setDescription("Retire un timeout (alias de unmute)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true)),
  async execute(client, interaction) {
    const member = interaction.options.getMember("membre", true);
    await deferPublic(interaction);
    await member.timeout(null);
    await client.prisma.punishment.create({
      data: {
        guildId: interaction.guildId,
        userId: member.id,
        moderatorId: interaction.user.id,
        type: "DEMUTE",
        reason: "Timeout retire"
      }
    });
    const embed = buildSanctionEmbed({
      title: interaction.guild.name,
      targetLabel: `${member} (${member.user.tag})`,
      reason: "Timeout retiré",
      moderatorLabel: `${interaction.user} (${interaction.user.tag})`
    });
    await interaction.editReply({ embeds: [embed] });
  }
};
