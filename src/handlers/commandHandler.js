const fs = require("node:fs");
const path = require("node:path");

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
    else if (
      entry.isFile() &&
      entry.name.endsWith(".js") &&
      !entry.name.startsWith("_") &&
      !DISABLED_COMMAND_FILES.has(entry.name)
    )
      files.push(full);
  }
  return files;
}

function resolveCommandName(command) {
  const d = command?.data;
  if (!d) return null;
  if (typeof d.name === "string" && d.name) return d.name;
  try {
    const json = typeof d.toJSON === "function" ? d.toJSON() : null;
    return json?.name || null;
  } catch {
    return null;
  }
}

function loadCommands(client) {
  client.commands.clear();
  const commandFiles = walk(path.join(__dirname, "..", "commands"));
  for (const file of commandFiles) {
    let command;
    try {
      command = require(file);
    } catch (e) {
      console.error(`[COMMANDS] Erreur chargement ${path.basename(file)}:`, e?.message || e);
      continue;
    }
    const name = resolveCommandName(command);
    if (!name || typeof command.execute !== "function") {
      console.warn(`[COMMANDS] Ignore ${path.basename(file)} (name ou execute manquant).`);
      continue;
    }
    client.commands.set(name, command);
  }
  client._commandsLoaded = client.commands.size;
  return client.commands.size;
}

function clearCommandsCache() {
  const commandsDir = path.join(__dirname, "..", "commands") + path.sep;
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(commandsDir)) delete require.cache[key];
  }
}

function unloadCommands(client) {
  const before = client.commands.size;
  client.commands.clear();
  console.log(`[COMMANDS] ${before} commandes dechargees.`);
  return before;
}

function reloadCommands(client) {
  clearCommandsCache();
  return loadCommands(client);
}

module.exports = { loadCommands, unloadCommands, reloadCommands };
