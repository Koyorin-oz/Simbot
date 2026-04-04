const {SlashCommandBuilder, EmbedBuilder} = require("discord.js");
const config = require("../../config");
const { ensureUser, randomBetween } = require("../../services/economyService");
const { formatSC } = require("../../utils/currency");
const { deferPublic } = require("../../utils/slashDefer");
const { isDailyAlreadyClaimedParisDay } = require("../../utils/parisDate");

module.exports = {
  data: new SlashCommandBuilder().setName("journalier").setDescription("Réclame ta récompense journalière de SC."),
  async execute(client, interaction) {
    await deferPublic(interaction);
    const reward = config.rewards.dailyOptions[randomBetween(0, config.rewards.dailyOptions.length - 1)];
    const claim = await client.prisma.rewardClaim.upsert({
      where: { userId_guildId: { userId: interaction.user.id, guildId: interaction.guildId } },
      create: { userId: interaction.user.id, guildId: interaction.guildId, dailyAt: new Date(0) },
      update: {}
    });
    if (isDailyAlreadyClaimedParisDay(claim.dailyAt)) {
      await interaction.editReply({
        content:
          "Journalier déjà récupéré pour aujourd'hui (heure de Paris). Reviens après minuit, heure française."
      });
      return;
    }

    await ensureUser(client.prisma, interaction.guildId, interaction.user.id);
    await client.prisma.user.update({ where: { userId: interaction.user.id }, data: { simbaCoins: { increment: reward } } });
    await client.prisma.rewardClaim.update({
      where: { userId_guildId: { userId: interaction.user.id, guildId: interaction.guildId } },
      data: { dailyAt: new Date() }
    });

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL({ size: 128 }) })
      .setTitle("Journalier")
      .setDescription(`${interaction.user} a reçu **${formatSC(reward)} SC**.`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
