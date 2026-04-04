require("dotenv").config({ override: true });
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

client.login(process.env.DISCORD_TOKEN);

process.on("SIGINT", async () => {
  await client.prisma.$disconnect();
  process.exit(0);
});
