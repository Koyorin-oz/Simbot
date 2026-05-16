const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const { parseFrenchDurationMs } = require("../../utils/frenchDurationMs");
const { buildSanctionEmbed } = require("../../utils/sanctionEmbed");
const {
  buildPostSanctionDmEmbed,
  moderatorLabelForDm,
  trySendSanctionDm,
  sendSanctionChannelFallback
} = require("../../utils/sanctionDmNotice");
const { deferPublic } = require("../../utils/slashDefer");
const { assertCanSanctionMember, formatBotHierarchyBlockReason } = require("../../utils/staffSanctionHierarchy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute via timeout natif")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre cible").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("duree")
        .setDescription("Ex: 10m, 1h, 2j, 1sem, 1mois (max 28 j)")
        .setRequired(true)
    )
    .addStringOption(o => o.setName("raison").setDescription("Raison").setRequired(false))
    .addBooleanOption(o =>
      o.setName("anonyme").setDescription("Masquer le modérateur dans le MP à la cible").setRequired(false)
    ),
  async execute(client, interaction) {
    await deferPublic(interaction);

    const targetUser = interaction.options.getUser("membre", true);
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    const durationRaw = interaction.options.getString("duree", true);
    const reason = interaction.options.getString("raison") || "Aucune raison";
    const anonyme = interaction.options.getBoolean("anonyme") === true;
    const parsed = parseFrenchDurationMs(durationRaw, {
      minMs: 1000,
      maxMs: MAX_TIMEOUT_MS,
      examples: "`10m`, `1h`, `2j`, `1sem`, `1mois`"
    });
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
    if (!member.moderatable) {
      const botWhy = formatBotHierarchyBlockReason(interaction.guild, member);
      return interaction.editReply({
        content:
          botWhy ||
          "Je ne peux pas appliquer le timeout. Vérifie que j’ai **Modérer les membres** et que mon rôle est **au-dessus** de la cible dans **Paramètres → Rôles**."
      });
    }
    if (!parsed.ok) {
      return interaction.editReply({ content: parsed.error });
    }
    const duration = parsed.ms;

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
    const byDm = moderatorLabelForDm(interaction, anonyme);
    const dmEmbed = buildPostSanctionDmEmbed({
      guildName: interaction.guild.name,
      type: "MUTE",
      reason,
      byLabel: byDm,
      endsAt
    });
    const dmOk = await trySendSanctionDm(member.user, dmEmbed);

    let fallbackLine = "";
    if (!dmOk) {
      const fb = await sendSanctionChannelFallback({
        guild: interaction.guild,
        user: member.user,
        embed: dmEmbed
      });
      fallbackLine = fb.ok
        ? ` Fil privé de notification créé : <#${fb.threadId}>.`
        : ` Fil privé impossible (raison : \`${fb.reason}\`).`;
    }

    const embed = buildSanctionEmbed({
      title: interaction.guild.name,
      targetLabel: `${member} (${member.user.tag})`,
      reason,
      moderatorLabel: `${interaction.user} (${interaction.user.tag})`,
      endsAt
    });
    await interaction.editReply({
      content: dmOk
        ? "MP de notification envoyé à la cible."
        : `MP impossible (DM fermés ou refusés), mute appliqué.${fallbackLine}`,
      embeds: [embed]
    });
  }
};
