const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { unloadCommands } = require("../../handlers/commandHandler");
const { unloadEvents } = require("../../handlers/eventHandler");
const { stopVoiceGainTicker } = require("../../events/client/ready");

const FILTER_CHOICES = [
  { name: "all", value: "all" },
  { name: "commands", value: "commands" },
  { name: "events", value: "events" },
  { name: "database", value: "database" },
  { name: "voice", value: "voice" }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-stop")
    .setDescription("Stoppe un module (ou tout) depuis Discord")
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
      await interaction.editReply("Arret total lance. Le bot va s'eteindre.");
      setTimeout(async () => {
        await client.prisma.$disconnect().catch(() => null);
        client.destroy();
        process.exit(0);
      }, 500);
      return;
    }

    if (filter === "commands") {
      const before = unloadCommands(client);
      await interaction.editReply(`Module commandes stoppe (${before} commandes dechargees).`);
      return;
    }

    if (filter === "events") {
      const before = unloadEvents(client);
      await interaction.editReply(`Module evenements stoppe (${before} evenements decharges).`);
      return;
    }

    if (filter === "database") {
      await client.prisma.$disconnect().catch(() => null);
      await interaction.editReply("Module database stoppe (connexion Prisma fermee).");
      return;
    }

    const stopped = stopVoiceGainTicker(client);
    await interaction.editReply(
      stopped
        ? "Module voice stoppe (ticker vocal coupe)."
        : "Module voice deja a l'arret (aucun ticker actif)."
    );
  }
};
