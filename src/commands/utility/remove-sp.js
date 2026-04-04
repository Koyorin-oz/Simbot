const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { removeSP } = require("./_economyAdminUtils");
const { syncRankRoleForMember } = require("../../services/rankRoleService");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remove-sp")
    .setDescription("Admin: retire des Simba Points a un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true))
    .addIntegerOption((o) => o.setName("montant").setDescription("Montant a retirer").setMinValue(1).setRequired(true)),
  async execute(client, interaction) {
    const member = interaction.options.getUser("membre", true);
    const amount = interaction.options.getInteger("montant", true);
    await deferPublic(interaction);
    const updated = await removeSP(client.prisma, interaction.guildId, member.id, amount);
    const guildMember = await interaction.guild.members.fetch(member.id).catch(() => null);
    if (guildMember) await syncRankRoleForMember(client, guildMember, updated.simbaPoints).catch(() => null);
    await interaction.editReply(
      `Retrait de ${amount.toLocaleString("fr-FR")} SP a ${member.tag}. Nouveau total: ${updated.simbaPoints.toLocaleString("fr-FR")} SP.`
    );
  }
};
