/** Catégories des slash commands (dev / admin / modération / normal) — source unique pour visibilité + permissions. */

const DEV_COMMANDS = new Set(["dev-deployer", "dev-comptage-membre-deployer", "dev-settings", "dev-bienvenue"]);
const ADMIN_COMMANDS = new Set([
  "admin-give",
  "admin-remove",
  "adminargent",
  "admin-add-role",
  "admin-remove-role",
  "admin-role-masse",
  "admin-rank-roles-create",
  "admin-rank-roles-remove",
  "admin-restart",
  "admin-stop",
  "admin-reset-recompenses",
  "admin-reset-saison",
  "adminanniversaire",
  "setup-salons",
  "setup",
  "mode-maj",
  "arreter-simbot",
  "restart-simbot",
  "panel-ticket",
  "deployer-vrai-ids",
  "pause-economie",
  "resume-economie",
  "pause-ia",
  "ia-prompt",
  "dinguerie",
  "verification",
  "verification-telephone",
  "desactiver"
]);
const MODERATION_COMMANDS = new Set([
  "bannir",
  "expulser",
  "mute",
  "demutre",
  "fin-silence",
  "debannir",
  "warn",
  "clear",
  "effacer-message",
  "salon-verrou",
  "profil-moderateur",
  "sanction-lister",
  "settings-auto-moderation"
]);

function classifyCommand(commandName) {
  if (DEV_COMMANDS.has(commandName) || commandName.startsWith("dev-")) return "dev";
  if (ADMIN_COMMANDS.has(commandName) || commandName.startsWith("admin-")) return "admin";
  if (MODERATION_COMMANDS.has(commandName) || commandName.startsWith("mod-")) return "moderation";
  return "normal";
}

module.exports = {
  DEV_COMMANDS,
  ADMIN_COMMANDS,
  MODERATION_COMMANDS,
  classifyCommand
};
