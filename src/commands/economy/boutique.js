const { SlashCommandBuilder } = require("discord.js");
const config = require("../../config");
const { ensureUser } = require("../../services/economyService");
const { deferPublic } = require("../../utils/slashDefer");
const { getInventorySnapshot } = require("../../services/inventoryService");
const { buildShopPanel } = require("../../utils/componentsV2Panels");
const { readShopBannerAttachment } = require("../../utils/shopBanner");

module.exports = {
  data: new SlashCommandBuilder().setName("boutique").setDescription("Affiche la boutique interactive de LA CARMINAUTE."),
  async execute(client, interaction) {
    await deferPublic(interaction);
    const user = await ensureUser(client.prisma, interaction.guildId, interaction.user.id);
    const inv = await getInventorySnapshot(client.prisma, interaction.guildId, interaction.user.id);
    const now = new Date();
    const timeLabel = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const { attachment, hasFile } = readShopBannerAttachment();
    const panel = buildShopPanel(config, user.simbaCoins, timeLabel, null, {
      canBuyCustomRole: !user.customRoleUnlocked && !user.customRoleId && (inv.customRoleCount || 0) < 1,
      includeShopBanner: hasFile
    });
    await interaction.editReply({
      files: attachment ? [attachment] : [],
      components: panel.components,
      flags: panel.flags,
      embeds: panel.embeds ?? []
    });
  }
};
