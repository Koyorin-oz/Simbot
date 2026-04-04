const fs = require("node:fs");
const path = require("node:path");
const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  GatewayIntentBits
} = require("discord.js");
const config = require("../../config");
const { V2_MSG, ACCENT_COLOR } = require("../../utils/componentsV2Panels");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dev-settings")
    .setDescription("Diagnostic rapide de l'etat du bot")
    .addSubcommand((s) => s.setName("view").setDescription("Voir les modules qui tournent et ceux en erreur")),
  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "view") return;

    await interaction.deferReply();

    const checks = [];

    // Check 1: DB connectivity
    let dbOk = false;
    try {
      await client.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    checks.push({
      name: "database/prisma",
      description: "Verifie la connexion base de donnees",
      status: dbOk ? "running" : "stopped"
    });

    // Check 2: Welcome channel reachability
    let welcomeOk = false;
    if (interaction.guild && config.welcome?.channelId) {
      const channel = await interaction.guild.channels.fetch(config.welcome.channelId).catch(() => null);
      welcomeOk = !!(channel && channel.isTextBased());
    }
    checks.push({
      name: "welcome/channel",
      description: `Salon d'accueil (${config.welcome?.channelId || "non defini"})`,
      status: welcomeOk ? "running" : "warning"
    });

    // Check 3: Boutique image exists
    const shopImagePath = path.join(process.cwd(), "assets", "shop-banner.png");
    const shopImageOk = fs.existsSync(shopImagePath);
    checks.push({
      name: "boutique/banner",
      description: "Image de banniere /boutique",
      status: shopImageOk ? "running" : "warning"
    });

    // Check 4: Commands loaded
    checks.push({
      name: "commands/handler",
      description: `Commandes chargees: ${client.commands?.size || 0}`,
      status: client.commands?.size > 0 ? "running" : "stopped"
    });

    // Check 5: Privileged intents in runtime config
    const intents = client.options.intents?.bitfield ?? 0;
    const membersIntent = Boolean(intents & GatewayIntentBits.GuildMembers);
    const contentIntent = Boolean(intents & GatewayIntentBits.MessageContent);
    checks.push({
      name: "intents/runtime",
      description: `GuildMembers=${membersIntent ? "ON" : "OFF"} | MessageContent=${contentIntent ? "ON" : "OFF"}`,
      status: membersIntent && contentIntent ? "running" : "warning"
    });

    // Check 6: Economy log channel
    let ecoLogOk = false;
    if (interaction.guild && process.env.ECONOMY_LOG_CHANNEL_ID) {
      const eco = await interaction.guild.channels.fetch(process.env.ECONOMY_LOG_CHANNEL_ID).catch(() => null);
      ecoLogOk = !!(eco && eco.isTextBased());
    }
    checks.push({
      name: "economy/logs",
      description: process.env.ECONOMY_LOG_CHANNEL_ID
        ? `Canal logs economie (${process.env.ECONOMY_LOG_CHANNEL_ID})`
        : "Canal logs economie non configure",
      status: process.env.ECONOMY_LOG_CHANNEL_ID ? (ecoLogOk ? "running" : "warning") : "warning"
    });

    const block = checks
      .map((c) => {
        const icon = c.status === "running" ? "🟢" : c.status === "warning" ? "🟡" : "🔴";
        return `**${c.name}**\nDescription: ${c.description}\nEtat: ${icon} ${c.status}`;
      })
      .join("\n\n");

    const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR).addTextDisplayComponents(
        new TextDisplayBuilder().setContent("## :gear: Etat des Scripts\nListe des modules et leur etat actuel :")
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(block))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Uptime: **${Math.floor(process.uptime())}s** • Timestamp: <t:${Math.floor(Date.now() / 1000)}:R>`
        )
      );

    await interaction.editReply({
      components: [container],
      ...V2_MSG
    });
  }
};
