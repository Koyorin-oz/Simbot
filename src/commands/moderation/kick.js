const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { buildSanctionEmbed } = require("../../utils/sanctionEmbed");
const {
  buildPostSanctionDmEmbed,
  moderatorLabelForDm,
  trySendSanctionDm
} = require("../../utils/sanctionDmNotice");
const { deferPublic } = require("../../utils/slashDefer");
const { assertCanSanctionMember, formatBotHierarchyBlockReason } = require("../../utils/staffSanctionHierarchy");
const {
  DELETE_MESSAGE_HISTORY_CHOICES,
  parseDeleteMessageSecondsFromChoice,
  purgeUserMessagesInWindow
} = require("../../utils/moderationMessagePurge");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("expulser")
    .setDescription("Kick un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre a expulser").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison").setRequired(false))
    .addBooleanOption(o =>
      o.setName("anonyme").setDescription("Masquer le modérateur dans le MP à la cible").setRequired(false)
    )
    .addStringOption(o =>
      o
        .setName("supprimer_messages")
        .setDescription(
          "Supprimer les messages recents de ce membre (max 14 j par message, salons ou le bot peut gerer)"
        )
        .setRequired(false)
        .addChoices(...DELETE_MESSAGE_HISTORY_CHOICES)
    ),
  async execute(client, interaction) {
    const member = interaction.options.getMember("membre", true);
    const reason = interaction.options.getString("raison") || "Aucune raison";
    const anonyme = interaction.options.getBoolean("anonyme") === true;
    const deleteSeconds = parseDeleteMessageSecondsFromChoice(interaction.options.getString("supprimer_messages"));

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
    const kickedId = member.id;
    await member.kick(reason);
    let purgedCount = 0;
    if (deleteSeconds > 0) {
      try {
        purgedCount = await purgeUserMessagesInWindow(interaction.guild, kickedId, deleteSeconds);
      } catch (e) {
        console.warn("[KICK] purge messages", e?.message || e);
      }
    }
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
    let content = dmOk
      ? "MP de notification envoyé à la cible."
      : "MP impossible (DM fermés ou refusés), expulsion effectuée.";
    if (deleteSeconds > 0) {
      content += ` Messages supprimés (approx.) : **${purgedCount}** — uniquement les messages de moins de 14 j et dans les salons où j’ai Voir + Gérer + Historique.`;
    }
    await interaction.editReply({
      content,
      embeds: [embed]
    });
  }
};
