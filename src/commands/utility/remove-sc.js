const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { removeSC } = require("./_economyAdminUtils");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remove-sc")
    .setDescription("Admin: retire des Simba Coins a un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true))
    .addIntegerOption((o) => o.setName("montant").setDescription("Montant a retirer").setMinValue(1).setRequired(true)),
  async execute(client, interaction) {
    const member = interaction.options.getUser("membre", true);
    const amount = interaction.options.getInteger("montant", true);
    await deferPublic(interaction);
    const updated = await removeSC(client.prisma, interaction.guildId, member.id, amount);
    await interaction.editReply(
      `Retrait de ${amount.toLocaleString("fr-FR")} SC a ${member.tag}. Nouveau solde: ${updated.simbaCoins.toLocaleString("fr-FR")} SC.`
    );
  }
};
