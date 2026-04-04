const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildSanctionEmbed } = require("../../utils/sanctionEmbed");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Ajoute un avertissement")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre cible").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison").setRequired(true)),
  async execute(client, interaction) {
    const member = interaction.options.getMember("membre", true);
    const reason = interaction.options.getString("raison", true);
    await deferPublic(interaction);
    await client.prisma.punishment.create({ data: { guildId: interaction.guildId, userId: member.id, moderatorId: interaction.user.id, type: "WARN", reason } });
    const embed = buildSanctionEmbed({
      title: interaction.guild.name,
      targetLabel: `${member} (${member.user.tag})`,
      reason,
      moderatorLabel: `${interaction.user} (${interaction.user.tag})`
    });
    await interaction.editReply({ embeds: [embed] });
  }
};
