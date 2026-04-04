const {SlashCommandBuilder, EmbedBuilder} = require("discord.js");
const config = require("../../config");
const { ensureUser } = require("../../services/economyService");
const { formatSC } = require("../../utils/currency");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder().setName("mensuel").setDescription("Reclame ta recompense mensuelle de SC."),
  async execute(client, interaction) {
    await deferPublic(interaction);
    const claim = await client.prisma.rewardClaim.upsert({
      where: { userId_guildId: { userId: interaction.user.id, guildId: interaction.guildId } },
      create: { userId: interaction.user.id, guildId: interaction.guildId, monthlyAt: new Date(0) },
      update: {}
    });
    if (claim.monthlyAt && Date.now() - new Date(claim.monthlyAt).getTime() < 30 * 24 * 60 * 60 * 1000) {
      await interaction.editReply({ content: "Monthly deja recupere. Reviens le mois prochain." });
      return;
    }
    await ensureUser(client.prisma, interaction.guildId, interaction.user.id);
    await client.prisma.user.update({ where: { userId: interaction.user.id }, data: { simbaCoins: { increment: config.rewards.monthly } } });
    await client.prisma.rewardClaim.update({
      where: { userId_guildId: { userId: interaction.user.id, guildId: interaction.guildId } },
      data: { monthlyAt: new Date() }
    });
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL({ size: 128 }) })
      .setTitle("Monthly")
      .setDescription(`${interaction.user} a recu **${formatSC(config.rewards.monthly)} SC**.`)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }
};
