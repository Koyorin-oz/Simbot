require("dotenv").config({ override: true });
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
const { mainGuildId } = require("./config");

const DISABLED_COMMAND_FILES = new Set([
  "give-sc.js",
  "give-sp.js",
  "give-lp.js",
  "remove-sc.js",
  "remove-sp.js",
  "remove-lp.js"
]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".js") && !DISABLED_COMMAND_FILES.has(entry.name)) files.push(full);
  }
  return files;
}

(async () => {
  const argGuildId = process.argv[2];
  const guildId = argGuildId || process.env.DISCORD_GUILD_ID || process.env.GUILD_ID || mainGuildId;
  console.log(
    `[DEPLOY] CLIENT_ID=${process.env.DISCORD_CLIENT_ID} GUILD_ID=${guildId} SOURCE=${argGuildId ? "argv" : "env"}`
  );
  const commands = [];
  const files = walk(path.join(__dirname, "commands"));
  for (const file of files) {
    const cmd = require(file);
    if (!cmd?.data) continue;
    const payload = cmd.data.toJSON();
    // On rend toutes les commandes visibles, puis on applique les permissions
    // au runtime dans interactionCreate (avec bypass owner).
    payload.default_member_permissions = null;
    commands.push(payload);
  }

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId), {
    body: commands
  });
  console.log(`Commandes deployees: ${commands.length}`);
  console.log(
    "[DEPLOY] Acces runtime SimBot : commandes dev/admin -> role COMMAND_ADMIN_DEV_ROLE_ID (defaut 739948639300092055) ; moderation -> COMMAND_MODERATION_ROLE_ID (defaut 736488084929118298) ; + COMMAND_OWNER_USER_ID."
  );
  console.log(
    "[DEPLOY] Note : Discord ne permet plus aux bots de regler la visibilite des slashs par API. Pour masquer des commandes dans le menu client : Parametres serveur > Integrations > SimBot > Commandes."
  );
})();
