const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");
const { buildSanctionEmbed } = require("../../utils/sanctionEmbed");
const { moderatorLabelForDm } = require("../../utils/sanctionDmNotice");
const { APPEAL_FORM_URL } = require("../../utils/ticketPanels");
const { assertCanSanctionMember } = require("../../utils/staffSanctionHierarchy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bannir")
    .setDescription("Ban un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre a bannir").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison").setRequired(false))
    .addBooleanOption(o =>
      o.setName("anonyme").setDescription("Masquer le modérateur dans le MP à la cible").setRequired(false)
    ),
  async execute(client, interaction) {
    const user = interaction.options.getUser("membre", true);
    const reason = interaction.options.getString("raison") || "Aucune raison";
    const anonyme = interaction.options.getBoolean("anonyme") === true;
    const byDm = moderatorLabelForDm(interaction, anonyme);

    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    const hierarchyFail = assertCanSanctionMember(
      interaction.member,
      targetMember,
      interaction.guild,
      interaction.user.id
    );
    if (hierarchyFail) {
      await interaction.reply({ content: hierarchyFail, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();

    const preBanDm = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("Avertissement de moderation")
      .setDescription(
        [
          "T'es sur le point de te faire bannir de la Carminauté. Voici le bouton pour les débannissements ci-dessous si tu souhaites faire une demande :",
          "",
          "Information :",
          "Si tu penses qu'il s'agit d'une erreur, contacte le staff via le bouton ci-dessous :"
        ].join("\n")
      )
      .addFields(
        { name: "Sanctionné par", value: byDm, inline: true },
        { name: "Raison", value: reason, inline: false },
        { name: "Serveur", value: interaction.guild.name, inline: true },
        { name: "Action", value: "Bannissement", inline: true }
      )
      .setTimestamp();
    const appealRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Success)
        .setCustomId("ban_appeal_open")
        .setLabel("Voir la raison / faire une demande ➡️")
    );
    const embedDmOk = await user.send({ embeds: [preBanDm], components: [appealRow] }).then(() => true).catch(() => false);
    const linkDmOk =
      embedDmOk &&
      (await user
        .send({ content: `**Debannissement:** ${APPEAL_FORM_URL}` })
        .then(() => true)
        .catch(() => false));
    const dmSent = embedDmOk;

    await interaction.guild.members.ban(user.id, { reason });
    await client.prisma.punishment.create({ data: { guildId: interaction.guildId, userId: user.id, moderatorId: interaction.user.id, type: "BAN", reason } });
    const embed = buildSanctionEmbed({
      title: interaction.guild.name,
      targetLabel: `<@${user.id}> (${user.tag})`,
      reason,
      moderatorLabel: `${interaction.user} (${interaction.user.tag})`
    });
    let dmLine = dmSent
      ? "DM envoye avant bannissement."
      : "DM impossible (probablement fermes), bannissement effectue quand meme.";
    if (dmSent && !linkDmOk) dmLine += " Le second message (lien direct) n'a pas pu etre envoye.";
    await interaction.editReply({
      content: dmLine,
      embeds: [embed]
    });
  }
};
