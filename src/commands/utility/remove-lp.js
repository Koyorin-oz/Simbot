const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { removeLP } = require("./_economyAdminUtils");
const { syncLevel3RoleForMember } = require("../../services/levelRoleService");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remove-lp")
    .setDescription("Admin: retire des Level Points a un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true))
    .addIntegerOption((o) => o.setName("montant").setDescription("Montant a retirer").setMinValue(1).setRequired(true)),
  async execute(client, interaction) {
    const member = interaction.options.getUser("membre", true);
    const amount = interaction.options.getInteger("montant", true);
    await deferPublic(interaction);
    const updated = await removeLP(client.prisma, interaction.guildId, member.id, amount);
    const guildMember = await interaction.guild.members.fetch(member.id).catch(() => null);
    if (guildMember) await syncLevel3RoleForMember(guildMember, updated.level).catch(() => null);
    await interaction.editReply(
      `Retrait de ${amount.toLocaleString("fr-FR")} LP a ${member.tag}. Niveau: ${updated.level}, LP: ${updated.levelPoints}.`
    );
  }
};
