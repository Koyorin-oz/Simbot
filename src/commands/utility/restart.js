const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { PrismaClient } = require("@prisma/client");
const { reloadCommands } = require("../../handlers/commandHandler");
const { reloadEvents } = require("../../handlers/eventHandler");
const { startVoiceGainTicker } = require("../../events/client/ready");

const FILTER_CHOICES = [
  { name: "all", value: "all" },
  { name: "commands", value: "commands" },
  { name: "events", value: "events" },
  { name: "database", value: "database" },
  { name: "voice", value: "voice" }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-restart")
    .setDescription("Redemarre un module (ou tout) depuis Discord")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName("filter")
        .setDescription("Choisis un module ou all")
        .setRequired(true)
        .addChoices(...FILTER_CHOICES)
    ),
  async execute(client, interaction) {
    const filter = interaction.options.getString("filter", true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (filter === "all") {
      await interaction.editReply(
        "Restart total lance. Le process va se fermer maintenant (il doit etre relance par PM2/service/host)."
      );
      setTimeout(() => process.exit(0), 500);
      return;
    }

    if (filter === "commands") {
      const total = reloadCommands(client);
      await interaction.editReply(`Module commandes redemarre. ${total} commandes rechargees.`);
      return;
    }

    if (filter === "events") {
      const total = reloadEvents(client);
      await interaction.editReply(`Module evenements redemarre. ${total} evenements rechargees.`);
      return;
    }

    if (filter === "database") {
      await client.prisma.$disconnect().catch(() => null);
      client.prisma = new PrismaClient();
      await client.prisma.$connect();
      await interaction.editReply("Module database redemarre.");
      return;
    }

    startVoiceGainTicker(client);
    await interaction.editReply("Module voice redemarre (ticker vocal relance).");
  }
};
