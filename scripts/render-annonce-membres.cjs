/**
 * Génère l'annonce membres avec vraies mentions <@&id> à partir de
 * src/data/realServerIds.js → roles.rankRolePingIdsByKey
 *
 * Usage :
 *   node scripts/render-annonce-membres.cjs
 *   node scripts/render-annonce-membres.cjs --discord-only
 * (--discord-only = sans le bloc d’instructions du haut, pour coller direct sur le serveur.)
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const { roles } = require(path.join(root, "src", "data", "realServerIds.js"));
const ids = roles.rankRolePingIdsByKey || {};

const RANK_ORDER = [
  ["hyene_1", "Hyène I", 0],
  ["hyene_2", "Hyène II", 500],
  ["hyene_3", "Hyène III", 1000],
  ["pumba_1", "Pumba I", 3000],
  ["pumba_2", "Pumba II", 4000],
  ["pumba_3", "Pumba III", 5000],
  ["shenzi_1", "Shenzi I", 9000],
  ["shenzi_2", "Shenzi II", 11000],
  ["shenzi_3", "Shenzi III", 13000],
  ["timon_1", "Timon I", 21000],
  ["timon_2", "Timon II", 25000],
  ["timon_3", "Timon III", 29000],
  ["nala_1", "Nala I", 45000],
  ["nala_2", "Nala II", 53000],
  ["nala_3", "Nala III", 61000],
  ["scar", "Sarabi", 100000],
  ["cardinal", "Cardinal", 200000]
];

const mentions = RANK_ORDER.map(([key]) => {
  const id = String(ids[key] || "").trim();
  return id ? `<@&${id}>` : null;
}).filter(Boolean);

const megaLine =
  mentions.length > 0
    ? `${mentions.join(" ")}\n\n*(Tu as été notifié si tu as un de ces rôles de rang.)*`
    : "*(Configure d’abord les IDs dans `src/data/realServerIds.js` → `roles.rankRolePingIdsByKey`, puis relance ce script.)*";

let text = fs.readFileSync(path.join(root, "docs", "annonce-guide-membres.txt"), "utf8");
text = text.replace(/\{\{MEGA_PING_LINE\}\}/g, megaLine);

for (const [key, name] of RANK_ORDER) {
  const id = String(ids[key] || "").trim();
  const token = `<@&REPLACE_${key}>`;
  const repl = id ? `<@&${id}>` : `**${name}** *(ajoute l’ID du rôle dans realServerIds.js)*`;
  text = text.split(token).join(repl);
}

if (process.argv.includes("--discord-only")) {
  const start = text.indexOf("Salut la Carminauté");
  if (start >= 0) text = text.slice(start);
}

process.stdout.write(text);
