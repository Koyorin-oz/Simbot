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
        "✅ Rôles de rang traités pour ce serveur.",
        `- Rangs configurés : ${totalConfigured}`,
        `- Rôles trouvés/créés : ${totalResolved}`,
        "- Noms / couleurs / emoji mis à jour si besoin.",
        "- **L’ordre des rôles dans la liste Discord n’est plus modifié** par le bot (place-les à la main une fois). Réordonnancement auto uniquement si `RANK_ROLES_AUTO_REORDER=1` dans `.env`."
      ].join("\n")
    );
  }
};
