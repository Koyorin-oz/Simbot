#!/usr/bin/env node
/**
 * Pousse le dépôt sur GitHub en un geste (hors .env / ignorés Git).
 * Usage : npm run ship -- "message du commit"
 * Sans message : "chore: sync"
 */
const { execSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
process.chdir(root);

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: root, shell: true });
}

const msg = process.argv.slice(2).join(" ").trim() || "chore: sync";

let trackedEnv = "";
try {
  trackedEnv = execSync("git ls-files -- .env", { encoding: "utf8", cwd: root }).trim();
} catch {
  trackedEnv = "";
}
if (trackedEnv) {
  console.error("[ship] Refus : .env est suivi par Git — retire-le du suivi avant (ne jamais committer les secrets).");
  process.exit(1);
}

const status = execSync("git status --porcelain", { encoding: "utf8", cwd: root }).trim();
if (!status) {
  console.log("[ship] Rien à committer (working tree clean).");
  process.exit(0);
}

run("git add -A");
const staged = execSync("git diff --cached --name-only", { encoding: "utf8", cwd: root });
if (staged.split(/\r?\n/).some((f) => f === ".env" || f.endsWith("/.env"))) {
  console.error("[ship] Refus : .env serait inclus — annulation.");
  run("git reset HEAD .env");
  process.exit(1);
}

run(`git commit -m ${JSON.stringify(msg)}`);
try {
  run("git push origin main");
} catch {
  console.log("[ship] push main a échoué — essai avec -u origin main…");
  run("git push -u origin main");
}

console.log("[ship] OK — Pebble peut pull au prochain restart.");
