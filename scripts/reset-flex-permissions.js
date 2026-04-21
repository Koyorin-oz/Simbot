/**
 * Reset des permissions Discord pour /flex.
 *
 * Probleme : Discord conserve les overrides de permission (Parametres serveur >
 * Integrations > Bot > /flex) meme quand on redeploie la commande avec
 * `default_member_permissions = null`. Les bots ne peuvent plus modifier ces
 * overrides par API depuis 2022.
 *
 * Solution : SUPPRIMER la commande cote Discord (nouvel ID au redeploy => les
 * overrides lies a l'ancien ID sont definitivement perdus), puis relancer
 * `npm run deploy:commands` pour la recreer propre.
 *
 * Usage :
 *   node scripts/reset-flex-permissions.js
 *   (optionnel) node scripts/reset-flex-permissions.js <guildId>
 */

const fs = require("node:fs");
const path = require("node:path");

const envPath = path.join(__dirname, "..", ".env");
if (!fs.existsSync(envPath)) {
  console.error(`[RESET_FLEX] .env introuvable : ${envPath}`);
  process.exit(1);
}
require("dotenv").config({ path: envPath, override: true });

const { REST, Routes } = require("discord.js");
const { mainGuildId, botTestGuildId } = require("../src/config");

function resolveToken() {
  return String(
    process.env.DISCORD_TOKEN ||
      process.env.DISCORD_BOT_TOKEN ||
      process.env.BOT_TOKEN ||
      process.env.TOKEN ||
      ""
  ).trim();
}

function resolveClientId() {
  return String(
    process.env.DISCORD_CLIENT_ID ||
      process.env.CLIENT_ID ||
      process.env.APPLICATION_ID ||
      process.env.DISCORD_APPLICATION_ID ||
      ""
  ).trim();
}

(async () => {
  const token = resolveToken();
  const clientId = resolveClientId();
  if (!token || !clientId) {
    console.error("[RESET_FLEX] Token ou CLIENT_ID manquant dans .env");
    process.exit(1);
  }

  const argGuildId = process.argv[2];
  const guildIds = argGuildId
    ? [argGuildId]
    : [...new Set([mainGuildId, botTestGuildId].filter(Boolean))];

  const rest = new REST({ version: "10" }).setToken(token);

  for (const guildId of guildIds) {
    console.log(`\n[RESET_FLEX] === Guild ${guildId} ===`);

    /** @type {Array<{id:string,name:string}>} */
    const commands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
    const flex = commands.find((c) => c.name === "flex");

    if (!flex) {
      console.log("[RESET_FLEX] /flex non enregistree sur ce guild -> rien a supprimer.");
      continue;
    }

    console.log(`[RESET_FLEX] /flex trouvee (id=${flex.id}) -> suppression...`);
    await rest.delete(Routes.applicationGuildCommand(clientId, guildId, flex.id));
    console.log("[RESET_FLEX] OK, commande supprimee. Les overrides lies a l'ancien ID sont nettoyes.");
  }

  console.log(
    "\n[RESET_FLEX] Termine. Lance maintenant :  npm run deploy:commands"
  );
  console.log(
    "[RESET_FLEX] Puis dans Discord : /flex reapparait, tout le monde peut l'utiliser dans le salon 1357819532416123071 (le code verifie le salon)."
  );
})();
