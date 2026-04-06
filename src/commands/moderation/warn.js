const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { buildSanctionEmbed } = require("../../utils/sanctionEmbed");
const {
  buildPostSanctionDmEmbed,
  moderatorLabelForDm,
  trySendSanctionDm
} = require("../../utils/sanctionDmNotice");
const { deferPublic } = require("../../utils/slashDefer");
const { assertCanSanctionMember } = require("../../utils/staffSanctionHierarchy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Ajoute un avertissement")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre cible").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison").setRequired(true))
    .addBooleanOption(o =>
      o.setName("anonyme").setDescription("Masquer le modérateur dans le MP à la cible").setRequired(false)
    ),
  async execute(client, interaction) {
    const member = interaction.options.getMember("membre", true);
    const reason = interaction.options.getString("raison", true);
    const anonyme = interaction.options.getBoolean("anonyme") === true;
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
    await client.prisma.punishment.create({ data: { guildId: interaction.guildId, userId: member.id, moderatorId: interaction.user.id, type: "WARN", reason } });
    const dmEmbed = buildPostSanctionDmEmbed({
      guildName: interaction.guild.name,
      type: "WARN",
      reason,
      byLabel: moderatorLabelForDm(interaction, anonyme)
    });
    const dmOk = await trySendSanctionDm(member.user, dmEmbed);

    const embed = buildSanctionEmbed({
      title: interaction.guild.name,
      targetLabel: `${member} (${member.user.tag})`,
      reason,
      moderatorLabel: `${interaction.user} (${interaction.user.tag})`
    });
    await interaction.editReply({
      content: dmOk ? "MP de notification envoyé à la cible." : "MP impossible (DM fermés ou refusés), avertissement enregistré.",
      embeds: [embed]
    });
  }
};
