const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const {
  getGuildState,
  enableMaintenanceMode,
  disableMaintenanceMode
} = require("../../services/maintenanceService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mode-maj")
    .setDescription("Active ou desactive le mode maintenance du serveur")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("activer")
        .setDescription("Bloque le serveur en mode maintenance")
        .addRoleOption((o) =>
          o
            .setName("role_staff")
            .setDescription("Role qui garde acces aux salons pendant la maintenance")
            .setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("desactiver")
        .setDescription("Retablit les permissions d'avant maintenance")
    )
    .addSubcommand((s) =>
      s
        .setName("statut")
        .setDescription("Voir l'etat actuel du mode maintenance")
    ),
  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand();
    const state = getGuildState(interaction.guildId);

    if (sub === "statut") {
      if (!state) {
        await interaction.reply({ content: "Mode maintenance: **desactive**.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({
        content: `Mode maintenance: **active**.\nRole staff: <@&${state.staffRoleId}>`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (sub === "activer") {
      if (state) {
        await interaction.reply({
          content: `Le mode maintenance est deja actif avec <@&${state.staffRoleId}>.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const staffRole = interaction.options.getRole("role_staff")
        || (process.env.STAFF_ROLE_ID ? interaction.guild.roles.cache.get(process.env.STAFF_ROLE_ID) : null);
      if (!staffRole) {
        await interaction.reply({
          content: "Role staff introuvable. Passe l'option `role_staff` (ou configure STAFF_ROLE_ID).",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const me = interaction.guild.members.me;
      if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.reply({
          content: "Le bot doit avoir la permission Gerer les salons.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await enableMaintenanceMode(interaction.guild, staffRole.id, interaction.user.tag);
      await interaction.editReply(
        [
          "🛠️ Mode maintenance active.",
          `- Role staff autorise: ${staffRole}`,
          `- Salons verrouilles: ${result.updatedChannels}`,
          `- Invitations supprimees: ${result.deletedInvites}`,
          "Tout le monde (@everyone) est bloque, sauf le role staff."
        ].join("\n")
      );
      return;
    }

    if (!state) {
      await interaction.reply({ content: "Le mode maintenance n'est pas actif.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await disableMaintenanceMode(interaction.guild, interaction.user.tag);
    await interaction.editReply(
      [
        "✅ Mode maintenance desactive.",
        `- Salons restaures: ${result.restoredChannels}`,
        `- Role staff qui etait autorise: <@&${result.staffRoleId}>`
      ].join("\n")
    );
  }
};
