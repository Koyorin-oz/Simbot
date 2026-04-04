const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildModeratorProfilePanel } = require("../../utils/componentsV2Panels");
const { getModeratorProfileView } = require("../../services/moderatorProfileService");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profil-moderateur")
    .setDescription("Affiche le profil sanctions d'un moderateur")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("moderateur").setDescription("Moderateur cible").setRequired(false)),
  async execute(client, interaction) {
    const moderator = interaction.options.getUser("moderateur") || interaction.user;
    await deferPublic(interaction);
    const view = await getModeratorProfileView(client.prisma, interaction.guildId, moderator.id, "ALL");
    const panel = buildModeratorProfilePanel(moderator, view);
    await interaction.editReply(panel);
  }
};
