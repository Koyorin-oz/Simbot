const {SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle, MessageFlags} = require("discord.js");
const { isCommandOwnerBypassUserId } = require("../../services/staffCommandPermissionsService");

function hasMassRoleAccess(interaction) {
  return (
    isCommandOwnerBypassUserId(interaction.user?.id) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("role")
    .setDescription("Gestion du role personnalise")
    .addSubcommand((s) => s.setName("perso").setDescription("Creer ton role perso si debloque"))
    .addSubcommand((s) =>
      s
        .setName("pour")
        .setDescription("Ajouter/retirer un role en masse avec filtre")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Action a appliquer")
            .setRequired(true)
            .addChoices(
              { name: "Ajouter", value: "ajouter" },
              { name: "Retirer", value: "retirer" }
            )
        )
        .addRoleOption((o) =>
          o
            .setName("cible")
            .setDescription("Membres qui possedent ce role seront vises")
            .setRequired(true)
        )
        .addRoleOption((o) =>
          o
            .setName("role")
            .setDescription("Role a ajouter/retirer")
            .setRequired(true)
        )
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Appliquer aux membres ou aux bots")
            .setRequired(true)
            .addChoices(
              { name: "Membre", value: "membre" },
              { name: "Bot", value: "bot" }
            )
        )
    ),
  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "pour") {
      if (!hasMassRoleAccess(interaction)) {
        await interaction.reply({
          content: "Commande réservée aux membres avec **Administrateur** (ou au propriétaire autorisé du bot).",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const action = interaction.options.getString("action", true);
      const conditionRole = interaction.options.getRole("cible", true);
      const targetRole = interaction.options.getRole("role", true);
      const type = interaction.options.getString("type", true);
      const onBots = type === "bot";

      const actionLabel = action === "ajouter" ? "ajouter" : "retirer";
      const impactVerb = action === "ajouter" ? "sera ajouté" : "sera retiré";
      const typeLabel = onBots ? "bots" : "membres";

      const confirmEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`Êtes-vous sûr de vouloir ${actionLabel} le rôle ${targetRole.name} en masse ?`)
        .setDescription(
          [
            `En cliquant sur **Oui**, le rôle ${targetRole} ${impactVerb} à tous les **${typeLabel}** possédant le rôle ${conditionRole}.`,
            "",
            "ℹ️ Cette opération peut durer un certain temps selon le nombre de profils affectés."
          ].join("\n")
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`rolepour:yes:${interaction.id}`)
          .setLabel("Oui")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`rolepour:no:${interaction.id}`)
          .setLabel("Non")
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [confirmEmbed], components: [row] });
      const reply = await interaction.fetchReply();

      const disabledRow = () =>
        new ActionRowBuilder().addComponents(
          ButtonBuilder.from(row.components[0]).setDisabled(true),
          ButtonBuilder.from(row.components[1]).setDisabled(true)
        );

      let accepted = false;
      try {
        const pressed = await reply.awaitMessageComponent({
          time: 60_000,
          filter: (i) =>
            i.user.id === interaction.user.id &&
            (i.customId === `rolepour:yes:${interaction.id}` || i.customId === `rolepour:no:${interaction.id}`)
        });
        accepted = pressed.customId.includes(":yes:");
        await pressed.deferUpdate().catch(() => null);
      } catch {
        await interaction.editReply({
          embeds: [
            EmbedBuilder.from(confirmEmbed)
              .setColor(0xfee75c)
              .setDescription("Demande expirée : aucune confirmation reçue."),
          ],
          components: [disabledRow()]
        });
        return;
      }

      if (!accepted) {
        await interaction.editReply({
          embeds: [
            EmbedBuilder.from(confirmEmbed)
              .setColor(0xed4245)
              .setDescription("Opération annulée : aucun changement appliqué."),
          ],
          components: [disabledRow()]
        });
        return;
      }

      await interaction.editReply({
        embeds: [
          EmbedBuilder.from(confirmEmbed).setColor(0x5865f2).setDescription(
            [
              "Traitement en cours...",
              `**Action :** ${action}`,
              `**Cible :** ${conditionRole}`,
              `**Rôle :** ${targetRole}`,
              `**Type :** ${typeLabel}`
            ].join("\n")
          )
        ],
        components: [disabledRow()]
      });

      await interaction.guild.members.fetch().catch(() => null);

      const members = interaction.guild.members.cache.filter(
        (m) => m.user.bot === onBots && m.roles.cache.has(conditionRole.id)
      );

      let ok = 0;
      let fail = 0;
      let skip = 0;
      for (const m of members.values()) {
        try {
          if (action === "ajouter") {
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
        .setTitle(`Opération terminée • ${action === "ajouter" ? "Ajout massif" : "Retrait massif"}`)
        .setDescription(
          [
            `**Rôle cible :** ${targetRole}`,
            `**Filtre rôle :** ${conditionRole}`,
            `**Type :** ${typeLabel}`,
            `**Modifications :** ${ok}`,
            `**Sans effet :** ${skip}`,
            `**Erreurs :** ${fail}`
          ].join("\n")
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [resultEmbed], components: [] });
      return;
    }

    if (sub !== "perso") return;

    const modal = new ModalBuilder().setCustomId("role_perso_create_modal").setTitle("Creation du role perso");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("role_name")
          .setLabel("Nom du role")
          .setPlaceholder("Ex: Carmina Legend")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("hex_color")
          .setLabel("Couleur HEX principale")
          .setPlaceholder("#FF55AA")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("gradient_enabled")
          .setLabel("Degrade ? (oui/non)")
          .setPlaceholder("oui")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("hex_color_2")
          .setLabel("2e couleur HEX (si degrade)")
          .setPlaceholder("#55CCFF")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("emoji_or_image")
          .setLabel("Emoji unicode ou URL image role icon")
          .setPlaceholder("🔥 ou https://...")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
    await interaction.showModal(modal);
  }
};
