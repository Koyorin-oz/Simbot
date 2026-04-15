const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addSC } = require("./_economyAdminUtils");
const { logEconomyAdminGive } = require("../../services/modLogService");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("give-sc")
    .setDescription("Admin: ajoute des Simba Coins a un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true))
    .addIntegerOption((o) => o.setName("montant").setDescription("Montant a ajouter").setMinValue(1).setRequired(true)),
  async execute(client, interaction) {
    const member = interaction.options.getUser("membre", true);
    const amount = interaction.options.getInteger("montant", true);
    await deferPublic(interaction);
    const updated = await addSC(client.prisma, interaction.guildId, member.id, amount);
    await interaction.editReply(
      `Ajout de ${amount.toLocaleString("fr-FR")} SC a ${member.tag}. Nouveau solde: ${updated.simbaCoins.toLocaleString("fr-FR")} SC.`
    );
    await logEconomyAdminGive(interaction.guild, {
      adminTag: interaction.user.tag,
      adminId: interaction.user.id,
      targetTag: member.tag,
      targetId: member.id,
      amount,
      currencyLabel: "SC (Simba Coins)",
      commandLabel: "/give-sc"
    }).catch(() => null);
  }
};
