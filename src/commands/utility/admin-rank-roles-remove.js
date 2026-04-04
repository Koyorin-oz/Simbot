const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { removeRankRolesForGuild } = require("../../services/rankRoleService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-rank-roles-remove")
    .setDescription("Supprime tous les roles de rang sur ce serveur")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(client, interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { deleted } = await removeRankRolesForGuild(client, interaction.guild);

    await interaction.editReply(
      deleted > 0
        ? `🗑️ Roles de rang supprimes: **${deleted}**`
        : "Aucun role de rang supprimable trouve."
    );
  }
};
