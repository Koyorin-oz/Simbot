const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { ensureRankRolesForGuild } = require("../../services/rankRoleService");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-rank-roles-create")
    .setDescription("Cree/met a jour les roles de rang sur ce serveur")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(client, interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const map = await ensureRankRolesForGuild(client, interaction.guild);
    const totalConfigured = config.rankSystem.thresholds.length;
    const totalResolved = Object.keys(map).length;

    await interaction.editReply(
      [
        "✅ Roles de rang traites pour ce serveur.",
        `- Rangs configures: ${totalConfigured}`,
        `- Roles trouves/crees: ${totalResolved}`,
        "- Ordre + couleurs + emoji appliques."
      ].join("\n")
    );
  }
};
