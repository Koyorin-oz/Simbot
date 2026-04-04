const { SlashCommandBuilder } = require("discord.js");
const { listBirthdays, getUpcomingBirthdays } = require("../../services/birthdayService");
const { buildBirthdayListPanel } = require("../../utils/birthdayPanels");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("anniversaires")
    .setDescription("Affiche la liste des prochains anniversaires"),
  async execute(client, interaction) {
    const rows = await listBirthdays(client.prisma, interaction.guildId);
    const upcoming = getUpcomingBirthdays(rows);
    await interaction.reply(await buildBirthdayListPanel(upcoming, interaction.guild));
  }
};
