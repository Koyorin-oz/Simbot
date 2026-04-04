const {SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder, MessageFlags} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("give-away")
    .setDescription("Créer un giveaway via un pop-up")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o
        .setName("mode")
        .setDescription("Qui peut participer ?")
        .setRequired(false)
        .addChoices(
          { name: "Open (tout le monde)", value: "open" },
          { name: "Exclure un rôle", value: "exclude_role" },
          { name: "Inclure seulement un rôle", value: "include_role" }
        )
    )
    .addRoleOption((o) =>
      o.setName("role").setDescription("Rôle ciblé pour inclure/exclure").setRequired(false)
    )
    .addChannelOption((o) =>
      o
        .setName("salon")
        .setDescription("Salon de publication (par défaut: salon actuel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),

  async execute(client, interaction) {
    const mode = interaction.options.getString("mode") || "open";
    const role = interaction.options.getRole("role");

    if (mode !== "open" && !role) {
      await interaction.reply({
        content: "Tu dois fournir l'option **role** avec les modes `include_role` / `exclude_role`.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    if (mode === "open" && role) {
      await interaction.reply({
        content: "Avec le mode **open**, ne mets pas de rôle.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const channel = interaction.options.getChannel("salon") || interaction.channel;
    if (!channel?.isTextBased?.()) {
      await interaction.reply({ content: "Salon invalide.", flags: MessageFlags.Ephemeral });
      return;
    }
    const me = interaction.guild.members.me;
    if (!channel.permissionsFor(me).has(["ViewChannel", "SendMessages"])) {
      await interaction.reply({
        content: "Je ne peux pas poster dans ce salon (permissions manquantes).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`ga:create:${mode}:${role?.id || "0"}:${channel.id}`)
      .setTitle("Configuration du giveaway");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ga_title")
          .setLabel("Titre du giveaway")
          .setStyle(TextInputStyle.Short)
          .setMinLength(3)
          .setMaxLength(120)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ga_desc")
          .setLabel("Description (optionnelle)")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1200)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ga_winners")
          .setLabel("Nombre de gagnants")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("1 à 20")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ga_duration")
          .setLabel("Durée (ex: 1h30m, 2j)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Unités: s, m, h, j, mois")
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
  }
};

