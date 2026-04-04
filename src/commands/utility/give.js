const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addSC, addSP, addLP } = require("./_economyAdminUtils");
const { formatSC } = require("../../utils/currency");
const { syncRankRoleForMember } = require("../../services/rankRoleService");
const { syncLevel3RoleForMember } = require("../../services/levelRoleService");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-give")
    .setDescription("Admin: donne des ressources a un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("money")
        .setDescription("Donner des Simba Coins")
        .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true))
        .addIntegerOption((o) => o.setName("montant").setDescription("Montant").setMinValue(1).setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("sp")
        .setDescription("Donner des Simba Points")
        .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true))
        .addIntegerOption((o) => o.setName("montant").setDescription("Montant").setMinValue(1).setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("lp")
        .setDescription("Donner des Level Points")
        .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true))
        .addIntegerOption((o) => o.setName("montant").setDescription("Montant").setMinValue(1).setRequired(true))
    ),
  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand();
    const member = interaction.options.getUser("membre", true);
    const amount = interaction.options.getInteger("montant", true);
    await deferPublic(interaction);

    if (sub === "money") {
      const updated = await addSC(client.prisma, interaction.guildId, member.id, amount);
      await interaction.editReply(
        `Ajout de ${formatSC(amount)} Simba Coins a ${member.tag}. Nouveau solde: ${formatSC(updated.simbaCoins)} SC.`
      );
      return;
    }
    if (sub === "sp") {
      const updated = await addSP(client.prisma, interaction.guildId, member.id, amount);
      const guildMember = await interaction.guild.members.fetch(member.id).catch(() => null);
      let syncStatus = null;
      if (guildMember) syncStatus = await syncRankRoleForMember(client, guildMember, updated.simbaPoints).catch(() => null);
      const syncWarning =
        syncStatus && !syncStatus.ok
          ? "\n⚠️ Role de rang non applique. Verifie la hierarchie des roles du bot et les permissions `Gerer les roles`."
          : "";
      await interaction.editReply(
        `Ajout de ${amount.toLocaleString("fr-FR")} SP a ${member.tag}. Nouveau total: ${updated.simbaPoints.toLocaleString("fr-FR")} SP.${syncWarning}`
      );
      return;
    }
    const updated = await addLP(client.prisma, interaction.guildId, member.id, amount);
    const guildMember = await interaction.guild.members.fetch(member.id).catch(() => null);
    if (guildMember) await syncLevel3RoleForMember(guildMember, updated.level).catch(() => null);
    await interaction.editReply(
      `Ajout de ${amount.toLocaleString("fr-FR")} LP a ${member.tag}. Niveau: ${updated.level}, LP: ${updated.levelPoints}.`
    );
  }
};
