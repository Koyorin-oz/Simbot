const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildModlogPanel } = require("../../utils/componentsV2Panels");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sanction-lister")
    .setDescription("Affiche le journal des sanctions d'un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true)),
  async execute(client, interaction) {
    const target = interaction.options.getUser("membre", true);
    await deferPublic(interaction);
    const sanctions = await client.prisma.punishment.findMany({
      where: { guildId: interaction.guildId, userId: target.id },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    await interaction.editReply(buildModlogPanel(target, sanctions));
  }
};
