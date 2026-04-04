const fs = require("node:fs");
const path = require("node:path");
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits
} = require("discord.js");
const { classifyCommand } = require("../utils/commandCategories");

const STORE_PATH = path.join(__dirname, "..", "data", "commandVisibility.json");
const CATEGORIES = ["dev", "admin", "moderation", "normal"];

function defaultState() {
  return { dev: false, admin: false, moderation: false, normal: false };
}

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  fs.writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function getGuildVisibility(guildId) {
  const store = readStore();
  const saved = store[guildId];
  return { ...defaultState(), ...(saved || {}) };
}

function setGuildVisibility(guildId, nextState) {
  const store = readStore();
  store[guildId] = { ...defaultState(), ...(nextState || {}) };
  writeStore(store);
  return store[guildId];
}

function baselineDefaultPerm(commandName, client) {
  if (classifyCommand(commandName) === "admin" || classifyCommand(commandName) === "dev") return null;
  const local = client.commands.get(commandName);
  if (!local?.data) return null;
  const raw = local.data.toJSON()?.default_member_permissions;
  if (raw === null || raw === undefined) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

function buildVisibilityMenu(state) {
  const icon = (disabled) => (disabled ? "🔴" : "🟢");
  const options = [
    { value: "disable:dev", label: "Désactiver DEV", description: "Cache les commandes dev", emoji: "🧪" },
    { value: "disable:admin", label: "Désactiver ADMIN", description: "Cache les commandes admin", emoji: "🛡️" },
    { value: "disable:moderation", label: "Désactiver MODÉRATION", description: "Cache les commandes modération", emoji: "🔨" },
    { value: "disable:normal", label: "Désactiver NORMALES", description: "Cache les commandes membres", emoji: "👥" },
    { value: "enable:dev", label: "Réactiver DEV", description: "Rend visibles les commandes dev", emoji: "✅" },
    { value: "enable:admin", label: "Réactiver ADMIN", description: "Rend visibles les commandes admin", emoji: "✅" },
    { value: "enable:moderation", label: "Réactiver MODÉRATION", description: "Rend visibles les commandes modération", emoji: "✅" },
    { value: "enable:normal", label: "Réactiver NORMALES", description: "Rend visibles les commandes membres", emoji: "✅" }
  ];

  return {
    content: [
      "## Gestion visibilité des commandes",
      `${icon(state.dev)} Dev`,
      `${icon(state.admin)} Admin`,
      `${icon(state.moderation)} Modération`,
      `${icon(state.normal)} Normales`,
      "",
      "Choisis une action dans le menu."
    ].join("\n"),
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("cmd_visibility_select")
          .setPlaceholder("Choisir une catégorie à activer/désactiver")
          .addOptions(options)
      )
    ]
  };
}

async function applyVisibilityForGuild(client, guild, nextState) {
  const state = setGuildVisibility(guild.id, nextState);
  const commands = await guild.commands.fetch();
  let updated = 0;
  let failed = 0;

  for (const cmd of commands.values()) {
    const category = classifyCommand(cmd.name);
    const disabled = Boolean(state[category]);
    const restricted = category === "dev" || category === "admin" || category === "moderation";
    let desired;
    if (restricted) {
      desired = disabled ? PermissionFlagsBits.Administrator : null;
    } else {
      desired = disabled ? PermissionFlagsBits.Administrator : baselineDefaultPerm(cmd.name, client);
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await cmd.edit({ defaultMemberPermissions: desired });
      updated += 1;
    } catch {
      failed += 1;
    }
  }

  return { state, updated, failed };
}

module.exports = {
  CATEGORIES,
  classifyCommand,
  getGuildVisibility,
  setGuildVisibility,
  buildVisibilityMenu,
  applyVisibilityForGuild
};
