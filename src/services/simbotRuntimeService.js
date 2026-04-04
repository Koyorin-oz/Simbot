const fs = require("node:fs");
const path = require("node:path");

const STATE_PATH = path.join(process.cwd(), "data", "simbot-runtime-state.json");

function ensureDir() {
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readState() {
  ensureDir();
  if (!fs.existsSync(STATE_PATH)) return { frozen: false, iaPaused: false };
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    return {
      frozen: Boolean(raw?.frozen),
      iaPaused: Boolean(raw?.iaPaused),
      updatedAt: raw?.updatedAt || null
    };
  } catch {
    return { frozen: false, iaPaused: false };
  }
}

function writeState(next) {
  ensureDir();
  const cur = readState();
  const payload = {
    frozen: next?.frozen !== undefined ? Boolean(next.frozen) : cur.frozen,
    iaPaused: next?.iaPaused !== undefined ? Boolean(next.iaPaused) : cur.iaPaused,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(STATE_PATH, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function isFrozen() {
  return readState().frozen === true;
}

function freezeSimBot() {
  return writeState({ frozen: true });
}

function unfreezeSimBot() {
  return writeState({ frozen: false });
}

function isIaPaused() {
  return readState().iaPaused === true;
}

function setIaPaused(paused) {
  return writeState({ iaPaused: Boolean(paused) });
}

module.exports = {
  readState,
  isFrozen,
  freezeSimBot,
  unfreezeSimBot,
  isIaPaused,
  setIaPaused
};
