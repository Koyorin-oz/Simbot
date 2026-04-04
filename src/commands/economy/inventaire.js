const { SlashCommandBuilder } = require("discord.js");
const { getInventorySnapshot } = require("../../services/inventoryService");
const { buildInventoryPanel } = require("../../utils/inventoryPanels");
const { deferEphemeral } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder().setName("inventaire").setDescription("Affiche ton inventaire d'objets."),
  async execute(client, interaction) {
    await deferEphemeral(interaction);
    const snapshot = await getInventorySnapshot(client.prisma, interaction.guildId, interaction.user.id);
    const panel = buildInventoryPanel(interaction, snapshot);
    await interaction.editReply(panel);
  }
};
