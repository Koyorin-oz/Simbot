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
const {
  DELETE_MESSAGE_HISTORY_CHOICES,
  parseDeleteMessageSecondsFromChoice
} = require("../../utils/moderationMessagePurge");
const { parseBanDurationMs } = require("../../utils/banDurationMs");
const { setPendingBanAnnounce } = require("../../services/banPublicAnnounceService");

function humanizeBanMs(durationMs) {
  if (durationMs >= 86400000) return `${Math.round(durationMs / 86400000)} jour(s)`;
  if (durationMs >= 3600000) return `${Math.round(durationMs / 3600000)} heure(s)`;
  return `${Math.max(1, Math.round(durationMs / 60000))} minute(s)`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bannir")
    .setDescription("Ban un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre a bannir").setRequired(true))
    .addStringOption(o =>
      o
        .setName("annoncer")
        .setDescription("Envoyer CHEH T'ES BAN dans le salon discussion ?")
        .setRequired(true)
        .addChoices(
          { name: "Oui", value: "oui" },
          { name: "Non", value: "non" }
        )
    )
    .addStringOption(o => o.setName("raison").setDescription("Raison").setRequired(false))
    .addStringOption(o =>
      o
        .setName("duree")
        .setDescription("Ban temporaire : 1h, 7j, 1mois, 1y… Vide = ban definitif.")
        .setRequired(false)
    )
    .addBooleanOption(o =>
      o.setName("anonyme").setDescription("Masquer le modérateur dans le MP à la cible").setRequired(false)
    )
    .addStringOption(o =>
      o
        .setName("supprimer_messages")
        .setDescription("Supprimer les messages recents de ce membre (comme sur le client Discord)")
        .setRequired(false)
        .addChoices(...DELETE_MESSAGE_HISTORY_CHOICES)
    ),
  async execute(client, interaction) {
    const user = interaction.options.getUser("membre", true);
    const reason = interaction.options.getString("raison") || "Aucune raison";
    const dureeRaw = interaction.options.getString("duree");
    const anonyme = interaction.options.getBoolean("anonyme") === true;
    const announcePublic = interaction.options.getString("annoncer", true) === "oui";
    const deleteSeconds = parseDeleteMessageSecondsFromChoice(interaction.options.getString("supprimer_messages"));
    const byDm = moderatorLabelForDm(interaction, anonyme);

    let durationMs = null;
    if (dureeRaw != null && String(dureeRaw).trim()) {
      const parsed = parseBanDurationMs(String(dureeRaw).trim());
      if (!parsed.ok) {
        await interaction.reply({
          content: `${parsed.error} Sans option **duree** = ban **definitif**.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      durationMs = parsed.ms;
    }

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
        {
          name: "Durée",
          value: durationMs ? `Temporaire (~${humanizeBanMs(durationMs)})` : "Définitif",
          inline: true
        },
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

    const banOpts = { reason };
    if (deleteSeconds > 0) banOpts.deleteMessageSeconds = deleteSeconds;
    setPendingBanAnnounce(interaction.guildId, user.id, announcePublic);
    await interaction.guild.members.ban(user.id, banOpts);
    const endsAt = durationMs ? new Date(Date.now() + durationMs) : null;
    await client.prisma.punishment.create({
      data: {
        guildId: interaction.guildId,
        userId: user.id,
        moderatorId: interaction.user.id,
        type: "BAN",
        reason,
        ...(endsAt ? { expiresAt: endsAt } : {})
      }
    });
    const embed = buildSanctionEmbed({
      title: interaction.guild.name,
      targetLabel: `<@${user.id}> (${user.tag})`,
      reason,
      moderatorLabel: `${interaction.user} (${interaction.user.tag})`,
      endsAt: endsAt || undefined
    });
    let dmLine = dmSent
      ? "DM envoye avant bannissement."
      : "DM impossible (probablement fermes), bannissement effectue quand meme.";
    if (dmSent && !linkDmOk) dmLine += " Le second message (lien direct) n'a pas pu etre envoye.";
    if (durationMs) {
      dmLine += ` Ban **temporaire** (~${humanizeBanMs(durationMs)}), deban automatique a l'echeance.`;
    } else {
      dmLine += " Ban **definitif**.";
    }
    if (deleteSeconds > 0) {
      const win =
        deleteSeconds % 86400 === 0
          ? `${deleteSeconds / 86400} dernier(s) jour(s)`
          : deleteSeconds % 3600 === 0
            ? `${deleteSeconds / 3600} derniere(s) heure(s)`
            : `${Math.max(1, Math.round(deleteSeconds / 60))} derniere(s) minute(s)`;
      dmLine += ` Historique des messages supprime (${win}, API Discord).`;
    }
    dmLine += announcePublic
      ? " Annonce publique (discussion) : **Oui**."
      : " Annonce publique (discussion) : **Non** (discret).";
    await interaction.editReply({
      content: dmLine,
      embeds: [embed]
    });
  }
};
