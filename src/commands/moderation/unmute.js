const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { buildSanctionEmbed } = require("../../utils/sanctionEmbed");
const { deferPublic } = require("../../utils/slashDefer");
const { assertCanSanctionMember } = require("../../utils/staffSanctionHierarchy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("demutre")
    .setDescription("Retire un timeout")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre cible").setRequired(true)),
  async execute(client, interaction) {
    const member = interaction.options.getMember("membre", true);
    const hierarchyFail = assertCanSanctionMember(
      interaction.member,
      member,
      interaction.guild,
      interaction.user.id
    );
    if (hierarchyFail) {
      await interaction.reply({ content: hierarchyFail, flags: MessageFlags.Ephemeral });
      return;
    }
    await deferPublic(interaction);
    await member.timeout(null);
    await client.prisma.punishment.create({ data: { guildId: interaction.guildId, userId: member.id, moderatorId: interaction.user.id, type: "UNMUTE", reason: "Timeout retire" } });
    const embed = buildSanctionEmbed({
      title: interaction.guild.name,
      targetLabel: `${member} (${member.user.tag})`,
      reason: "Timeout retiré",
      moderatorLabel: `${interaction.user} (${interaction.user.tag})`
    });
    await interaction.editReply({ embeds: [embed] });
  }
};
