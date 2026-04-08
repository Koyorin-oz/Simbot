const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });
const { Client, GatewayIntentBits, Partials, Collection } = require("discord.js");
const { PrismaClient } = require("@prisma/client");
const { loadCommands } = require("./handlers/commandHandler");
const { loadEvents } = require("./handlers/eventHandler");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildEmojisAndStickers
  ],
  partials: [Partials.GuildMember, Partials.User, Partials.Channel, Partials.Message]
});

client.commands = new Collection();
client.cooldowns = new Map();
client.shopSessions = new Map();
client.giveaways = new Map();
client.prisma = new PrismaClient();

loadCommands(client);
loadEvents(client);

const discordToken = String(
  process.env.DISCORD_TOKEN ||
    process.env.DISCORD_BOT_TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.TOKEN ||
    ""
).trim();
if (!discordToken) {
  console.error(
    "[BOOT] Token Discord manquant : definis DISCORD_TOKEN (ou BOT_TOKEN / TOKEN) dans .env a la racine du projet."
  );
  process.exit(1);
}
client.login(discordToken);

process.on("SIGINT", async () => {
  try {
    const { destroyAllConnections } = require("./services/musicService");
    destroyAllConnections();
  } catch {
    /* ignore */
  }
  await client.prisma.$disconnect();
  process.exit(0);
});
