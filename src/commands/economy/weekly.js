const {SlashCommandBuilder, EmbedBuilder} = require("discord.js");
const config = require("../../config");
const { ensureUser } = require("../../services/economyService");
const { formatSC } = require("../../utils/currency");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder().setName("hebdomadaire").setDescription("Reclame ta recompense hebdomadaire de SC."),
  async execute(client, interaction) {
    await deferPublic(interaction);
    const claim = await client.prisma.rewardClaim.upsert({
      where: { userId_guildId: { userId: interaction.user.id, guildId: interaction.guildId } },
      create: { userId: interaction.user.id, guildId: interaction.guildId, weeklyAt: new Date(0) },
      update: {}
    });
    if (claim.weeklyAt && Date.now() - new Date(claim.weeklyAt).getTime() < 7 * 24 * 60 * 60 * 1000) {
      await interaction.editReply({ content: "Weekly deja recupere. Reviens la semaine prochaine." });
      return;
    }
    await ensureUser(client.prisma, interaction.guildId, interaction.user.id);
    await client.prisma.user.update({ where: { userId: interaction.user.id }, data: { simbaCoins: { increment: config.rewards.weekly } } });
    await client.prisma.rewardClaim.update({
      where: { userId_guildId: { userId: interaction.user.id, guildId: interaction.guildId } },
      data: { weeklyAt: new Date() }
    });
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL({ size: 128 }) })
      .setTitle("Weekly")
      .setDescription(`${interaction.user} a recu **${formatSC(config.rewards.weekly)} SC**.`)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }
};
