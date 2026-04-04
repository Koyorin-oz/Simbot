const { SlashCommandBuilder } = require("discord.js");
const { buildLeaderboardPanel, formatLeaderboardViewerPlacement } = require("../../utils/componentsV2Panels");
const { getGuildLeaderboardRank } = require("../../services/leaderboardRankService");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("classement")
    .setDescription("Classements SC (Simba Coins), SP (Simba Points), LP (Level Points) avec pagination."),
  async execute(client, interaction) {
    await deferPublic(interaction);
    const users = await client.prisma.user.findMany({
      where: { guildId: interaction.guildId },
      orderBy: { simbaCoins: "desc" },
      take: 10
    });
    const guild = interaction.guild;
    await Promise.all(
      users.map((u) => (guild.members.cache.has(u.userId) ? Promise.resolve() : guild.members.fetch(u.userId).catch(() => null)))
    );
    if (!guild.members.cache.has(interaction.user.id)) {
      await guild.members.fetch(interaction.user.id).catch(() => null);
    }
    const metric = "sc";
    const placement = await getGuildLeaderboardRank(client.prisma, interaction.guildId, interaction.user.id, metric);
    const viewerFooter = placement
      ? formatLeaderboardViewerPlacement(guild, metric, placement.rank, interaction.user.id, placement.value)
      : "Tu n'as pas encore de statistiques enregistrées sur ce serveur.";
    const panel = buildLeaderboardPanel(metric, 0, users, guild, viewerFooter);
    await interaction.editReply(panel);
  }
};
