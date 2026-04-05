const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });
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
  const token = String(process.env.DISCORD_TOKEN || "").trim();
  const clientId = String(process.env.DISCORD_CLIENT_ID || "").trim();
  if (!token) {
    console.error(
      "[DEPLOY] DISCORD_TOKEN vide — verifie la racine du projet (fichier .env) et le nom exact de la variable."
    );
    process.exit(1);
  }
  if (!clientId) {
    console.error(
      "[DEPLOY] DISCORD_CLIENT_ID vide — c'est l'**Application ID** (Onglet General de ton app sur discord.com/developers)."
    );
    console.error(
      "[DEPLOY] Si ton .env utilise CLIENT_ID ou APPLICATION_ID, renomme en DISCORD_CLIENT_ID=..."
    );
    process.exit(1);
  }

  const argGuildId = process.argv[2];
  const guildId = argGuildId || process.env.DISCORD_GUILD_ID || process.env.GUILD_ID || mainGuildId;
  console.log(
    `[DEPLOY] CLIENT_ID=${clientId} GUILD_ID=${guildId} SOURCE=${argGuildId ? "argv" : "env"}`
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

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
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
