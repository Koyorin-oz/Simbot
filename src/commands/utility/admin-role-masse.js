const {SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle, MessageFlags} = require("discord.js");
const { isCommandOwnerBypassUserId } = require("../../services/staffCommandPermissionsService");

function hasAccess(interaction) {
  return (
    isCommandOwnerBypassUserId(interaction.user?.id) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-role-masse")
    .setDescription("Ajouter ou retirer un role a tous les membres qui ont un role donne")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("ajouter")
        .setDescription("Donne un role a tous les membres qui possedent le role condition")
        .addRoleOption((o) => o.setName("role_a_donner").setDescription("Role a ajouter").setRequired(true))
        .addRoleOption((o) => o.setName("role_condition").setDescription("Uniquement les membres qui ont ce role").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("retirer")
        .setDescription("Retire un role a tous les membres qui possedent le role condition")
        .addRoleOption((o) => o.setName("role_a_retirer").setDescription("Role a retirer").setRequired(true))
        .addRoleOption((o) => o.setName("role_condition").setDescription("Uniquement les membres qui ont ce role").setRequired(true))
    ),
  async execute(client, interaction) {
    if (!hasAccess(interaction)) {
      await interaction.reply({
        content: "Commande réservée aux membres avec **Administrateur** (ou au propriétaire autorisé du bot).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const sub = interaction.options.getSubcommand(true);
    const condition = interaction.options.getRole("role_condition", true);
    const targetRole =
      sub === "ajouter"
        ? interaction.options.getRole("role_a_donner", true)
        : interaction.options.getRole("role_a_retirer", true);

    const actionText = sub === "ajouter" ? "ajouter" : "retirer";
    const impactedText =
      sub === "ajouter"
        ? `le rôle ${targetRole} sera ajouté`
        : `le rôle ${targetRole} sera retiré`;

    const confirmEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`Êtes-vous sûr de vouloir ${actionText} le rôle ${targetRole.name} en masse ?`)
      .setDescription(
        [
          `En cliquant sur **Oui**, ${impactedText} à tous les humains du serveur possédant le rôle ${condition}.`,
          "",
          "ℹ️ Cette opération peut durer un certain temps selon le nombre de membres affectés."
        ].join("\n")
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rmass:yes:${interaction.id}`)
        .setLabel("Oui")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`rmass:no:${interaction.id}`)
        .setLabel("Non")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      embeds: [confirmEmbed],
      components: [row]
    });

    const reply = await interaction.fetchReply();
    const disableButtons = () =>
      new ActionRowBuilder().addComponents(
        ButtonBuilder.from(row.components[0]).setDisabled(true),
        ButtonBuilder.from(row.components[1]).setDisabled(true)
      );

    let decision;
    try {
      const pressed = await reply.awaitMessageComponent({
        time: 60_000,
        filter: (i) =>
          i.user.id === interaction.user.id &&
          (i.customId === `rmass:yes:${interaction.id}` || i.customId === `rmass:no:${interaction.id}`)
      });
      decision = pressed.customId.includes(":yes:") ? "yes" : "no";
      await pressed.deferUpdate().catch(() => null);
    } catch {
      await interaction.editReply({
        embeds: [
          EmbedBuilder.from(confirmEmbed).setColor(0xfee75c).setDescription(
            [
              `Demande expirée : aucune confirmation reçue pour ${targetRole} (filtre : ${condition}).`,
              "",
              "Relance la commande si tu veux recommencer."
            ].join("\n")
          )
        ],
        components: [disableButtons()]
      });
      return;
    }

    if (decision === "no") {
      await interaction.editReply({
        embeds: [
          EmbedBuilder.from(confirmEmbed).setColor(0xed4245).setDescription(
            [
              `Opération annulée : aucun changement appliqué sur ${targetRole} (filtre : ${condition}).`
            ].join("\n")
          )
        ],
        components: [disableButtons()]
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        EmbedBuilder.from(confirmEmbed).setColor(0x5865f2).setDescription(
          [
            `Traitement en cours...`,
            `Action : **${sub}**`,
            `Rôle cible : ${targetRole}`,
            `Filtre : ${condition}`
          ].join("\n")
        )
      ],
      components: [disableButtons()]
    });

    await interaction.guild.members.fetch().catch(() => null);

    const members = interaction.guild.members.cache.filter(
      (m) => !m.user.bot && m.roles.cache.has(condition.id)
    );

    let ok = 0;
    let fail = 0;
    let skip = 0;
    for (const m of members.values()) {
      try {
        if (sub === "ajouter") {
          if (m.roles.cache.has(targetRole.id)) {
            skip += 1;
            continue;
          }
          await m.roles.add(targetRole.id);
          ok += 1;
        } else if (m.roles.cache.has(targetRole.id)) {
          await m.roles.remove(targetRole.id);
          ok += 1;
        } else {
          skip += 1;
        }
      } catch {
        fail += 1;
      }
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(fail > 0 ? 0xfee75c : 0x57f287)
      .setTitle(`Opération terminée • ${sub === "ajouter" ? "Ajout massif" : "Retrait massif"}`)
      .setDescription(
        [
          `**Rôle cible :** ${targetRole}`,
          `**Filtre :** ${condition}`,
          `**Modifications :** ${ok}`,
          `**Sans effet :** ${skip}`,
          `**Erreurs :** ${fail}`
        ].join("\n")
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [resultEmbed], components: [] });
  }
};
