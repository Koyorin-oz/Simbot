const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const realServerIds = require("../../data/realServerIds");
const { applyRealServerIdsToGuildSetup } = require("../../services/channelBootstrapService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("deployer-vrai-ids")
    .setDescription("Applique les IDs finaux prod en configuration active")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(client, interaction) {
    const targetGuildId = String(realServerIds?.guildId || "").trim();
    if (!targetGuildId) {
      await interaction.reply({ content: "Aucun `guildId` prod configure dans `realServerIds`.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.guildId !== targetGuildId) {
      await interaction.reply({
        content: `Cette commande doit etre lancee sur le serveur prod \`${targetGuildId}\` (serveur actuel: \`${interaction.guildId}\`).`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const setup = applyRealServerIdsToGuildSetup(interaction.guildId);
    const missing = [];
    if (!realServerIds?.channels?.verificationChannelId) missing.push("verificationChannelId");
    if (!realServerIds?.categories?.verifyTestCategoryId) missing.push("verifyTestCategoryId");
    if (!realServerIds?.categories?.verifyMainCategoryId) missing.push("verifyMainCategoryId");

    const lines = [
      "✅ IDs finaux appliques (runtime + `channelSetup.json`).",
      `- Bienvenue: ${setup.welcomeChannelId ? `<#${setup.welcomeChannelId}>` : "non defini"}`,
      `- Ticket panel: ${setup.ticketPanelChannelId ? `<#${setup.ticketPanelChannelId}>` : "non defini"}`,
      `- Logs: ${setup.modLogChannelId ? `<#${setup.modLogChannelId}>` : "non defini"}`,
      `- Commandes: ${setup.commandsChannelId ? `<#${setup.commandsChannelId}>` : "non defini"}`,
      `- Suggestions: ${setup.suggestionsChannelId ? `<#${setup.suggestionsChannelId}>` : "non defini"}`,
      `- Reglement: ${setup.reglementChannelId ? `<#${setup.reglementChannelId}>` : "non defini"}`,
      `- Repertoire: ${setup.repertoireChannelId ? `<#${setup.repertoireChannelId}>` : "non defini"}`,
      `- Verification salon: ${setup.rulesChannelId ? `<#${setup.rulesChannelId}>` : "non defini"}`
    ];
    if (missing.length) {
      lines.push("");
      lines.push(`⚠ IDs encore manquants: ${missing.map((m) => `\`${m}\``).join(", ")}`);
    }

    await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
  }
};
