const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addSP } = require("./_economyAdminUtils");
const { syncRankRoleForMember } = require("../../services/rankRoleService");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("give-sp")
    .setDescription("Admin: ajoute des Simba Points a un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true))
    .addIntegerOption((o) => o.setName("montant").setDescription("Montant a ajouter").setMinValue(1).setRequired(true)),
  async execute(client, interaction) {
    const member = interaction.options.getUser("membre", true);
    const amount = interaction.options.getInteger("montant", true);
    await deferPublic(interaction);
    const updated = await addSP(client.prisma, interaction.guildId, member.id, amount);
    const guildMember = await interaction.guild.members.fetch(member.id).catch(() => null);
    if (guildMember) await syncRankRoleForMember(client, guildMember, updated.simbaPoints).catch(() => null);
    await interaction.editReply(
      `Ajout de ${amount.toLocaleString("fr-FR")} SP a ${member.tag}. Nouveau total: ${updated.simbaPoints.toLocaleString("fr-FR")} SP.`
    );
  }
};
