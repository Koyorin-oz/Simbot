const fs = require("node:fs");
const path = require("node:path");

const STATE_PATH = path.join(process.cwd(), "data", "economy-runtime-state.json");

function ensureDir() {
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readState() {
  ensureDir();
  if (!fs.existsSync(STATE_PATH)) return { paused: false };
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    return { paused: Boolean(raw?.paused), updatedAt: raw?.updatedAt || null };
  } catch {
    return { paused: false };
  }
}

function writeState(next) {
  ensureDir();
  const payload = {
    paused: Boolean(next?.paused),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(STATE_PATH, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function isEconomyPaused() {
  return readState().paused === true;
}

function pauseEconomy() {
  return writeState({ paused: true });
}

function resumeEconomy() {
  return writeState({ paused: false });
}

module.exports = {
  readState,
  isEconomyPaused,
  pauseEconomy,
  resumeEconomy
};
