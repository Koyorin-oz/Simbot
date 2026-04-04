const {SlashCommandBuilder} = require("discord.js");
const { deferEphemeral } = require("../../utils/slashDefer");
const {
  MAX_LOAN,
  LOAN_COOLDOWN_DAYS,
  LOAN_DUE_DAYS,
  requestLoan,
  repayLoan,
  getLoanOverview
} = require("../../services/loanService");
const { formatSC } = require("../../utils/currency");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pret")
    .setDescription("Gerer tes prets a la banque SimBot")
    .addSubcommand((s) =>
      s
        .setName("demander")
        .setDescription("Demander un pret")
        .addIntegerOption((o) =>
          o
            .setName("montant")
            .setDescription(`Montant du pret (max ${formatSC(MAX_LOAN)} SC)`)
            .setMinValue(1)
            .setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("rembourser")
        .setDescription("Rembourser une partie du pret")
        .addIntegerOption((o) =>
          o
            .setName("montant")
            .setDescription("Montant a rembourser")
            .setMinValue(1)
            .setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("statut")
        .setDescription("Voir ton statut de pret")
    ),
  async execute(client, interaction) {
    await deferEphemeral(interaction);
    const sub = interaction.options.getSubcommand();

    if (sub === "demander") {
      const amount = interaction.options.getInteger("montant", true);
      const result = await requestLoan(client.prisma, interaction.guildId, interaction.user.id, amount);
      if (!result.ok) {
        await interaction.editReply({ content: result.error });
        return;
      }

      await interaction.editReply({
        content: [
          "🏦 Pret accorde par **SimBot Bank**.",
          `Montant: **${formatSC(amount)} SC**`,
          `Echeance: <t:${Math.floor(new Date(result.loan.dueAt).getTime() / 1000)}:R>`,
          `Rappel: 1 pret tous les ${LOAN_COOLDOWN_DAYS} jours, remboursement sous ${LOAN_DUE_DAYS} jours.`
        ].join("\n")
      });
      return;
    }

    if (sub === "rembourser") {
      const amount = interaction.options.getInteger("montant", true);
      const result = await repayLoan(client.prisma, interaction.guildId, interaction.user.id, amount);
      if (!result.ok) {
        await interaction.editReply({ content: result.error });
        return;
      }
      await interaction.editReply(
        result.closed
          ? `✅ Pret totalement rembourse. Montant verse: ${formatSC(result.paid)} SC.`
          : `✅ Remboursement pris en compte: ${formatSC(result.paid)} SC.\nReste: ${formatSC(result.remaining)} SC.`
      );
      return;
    }

    const overview = await getLoanOverview(client.prisma, interaction.guildId, interaction.user.id);
    if (!overview.active && !overview.lastLoan) {
      await interaction.editReply({
        content: "Aucun historique de pret. Utilise `/pret demander` pour commencer."
      });
      return;
    }

    if (overview.active) {
      await interaction.editReply({
        content: [
          "📌 Pret actif:",
          `- Principal: ${formatSC(overview.active.principal)} SC`,
          `- Reste a rembourser: ${formatSC(overview.active.remaining)} SC`,
          `- Echeance: <t:${Math.floor(new Date(overview.active.dueAt).getTime() / 1000)}:R>`,
          `- Defauts cumules: ${overview.defaultCount}`
        ].join("\n")
      });
      return;
    }

    const nextEligible = new Date(overview.lastLoan.nextEligibleAt);
    const now = Date.now();
    const waitDays = Math.max(0, Math.ceil((nextEligible.getTime() - now) / 86400000));
    await interaction.editReply({
      content: [
        "Aucun pret actif.",
        `Defauts cumules: ${overview.defaultCount}`,
        waitDays > 0
          ? `Prochain pret possible dans ${waitDays} jour(s).`
          : "Tu peux demander un nouveau pret maintenant."
      ].join("\n")
    });
  }
};
