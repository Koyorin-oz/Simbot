const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { buildSanctionEmbed } = require("../../utils/sanctionEmbed");
const {
  buildPostSanctionDmEmbed,
  moderatorLabelForDm,
  trySendSanctionDm
} = require("../../utils/sanctionDmNotice");
const { deferPublic } = require("../../utils/slashDefer");
const { assertCanSanctionMember, formatBotHierarchyBlockReason } = require("../../utils/staffSanctionHierarchy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("expulser")
    .setDescription("Kick un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre a expulser").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison").setRequired(false))
    .addBooleanOption(o =>
      o.setName("anonyme").setDescription("Masquer le modérateur dans le MP à la cible").setRequired(false)
    ),
  async execute(client, interaction) {
    const member = interaction.options.getMember("membre", true);
    const reason = interaction.options.getString("raison") || "Aucune raison";
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

    if (!member.moderatable) {
      const botWhy = formatBotHierarchyBlockReason(interaction.guild, member);
      await interaction.editReply({
        content:
          botWhy ||
          "Je ne peux pas expulser ce membre. Vérifie que mon rôle du bot est **au-dessus** de la cible dans **Paramètres → Rôles** et que j’ai **Expulser des membres**."
      });
      return;
    }

    const targetUser = member.user;
    await member.kick(reason);
    await client.prisma.punishment.create({ data: { guildId: interaction.guildId, userId: member.id, moderatorId: interaction.user.id, type: "KICK", reason } });

    const dmEmbed = buildPostSanctionDmEmbed({
      guildName: interaction.guild.name,
      type: "KICK",
      reason,
      byLabel: moderatorLabelForDm(interaction, anonyme)
    });
    const dmOk = await trySendSanctionDm(targetUser, dmEmbed);

    const embed = buildSanctionEmbed({
      title: interaction.guild.name,
      targetLabel: `${member} (${member.user.tag})`,
      reason,
      moderatorLabel: `${interaction.user} (${interaction.user.tag})`
    });
    await interaction.editReply({
      content: dmOk
        ? "MP de notification envoyé à la cible."
        : "MP impossible (DM fermés ou refusés), expulsion effectuée.",
      embeds: [embed]
    });
  }
};
