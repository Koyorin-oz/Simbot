const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const config = require("../../config");
const { ensureUser } = require("../../services/economyService");
const { deferPublic } = require("../../utils/slashDefer");
const { getInventorySnapshot } = require("../../services/inventoryService");
const { buildShopPanel } = require("../../utils/componentsV2Panels");

// Image de fond "Roi Lion" floutée.
// NOTE: le générateur d'image Cursor enregistre dans le dossier projects de Cursor.
// Tu peux remplacer cette valeur si tu stockes l'image directement dans ton repo.
const SHOP_BG_PATH = "assets\\shop-banner.png";

function getLionAttachment() {
  // eslint-disable-next-line global-require
  const fs = require("node:fs");
  const buffer = fs.readFileSync(SHOP_BG_PATH);
  return new AttachmentBuilder(buffer, { name: "shop-banner.png" });
}

module.exports = {
  data: new SlashCommandBuilder().setName("boutique").setDescription("Affiche la boutique interactive de LA CARMINAUTE."),
  async execute(client, interaction) {
    await deferPublic(interaction);
    const user = await ensureUser(client.prisma, interaction.guildId, interaction.user.id);
    const inv = await getInventorySnapshot(client.prisma, interaction.guildId, interaction.user.id);
    const now = new Date();
    const timeLabel = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const attachment = getLionAttachment();
    const panel = buildShopPanel(config, user.simbaCoins, timeLabel, null, {
      canBuyCustomRole: !user.customRoleUnlocked && !user.customRoleId && (inv.customRoleCount || 0) < 1
    });
    await interaction.editReply({ files: [attachment], ...panel });
  }
};
