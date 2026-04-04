const fs = require("node:fs");
const path = require("node:path");

const STORE_PATH = path.join(__dirname, "..", "data", "blagueCooldown.json");

function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

function saveStore(obj) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2), "utf8");
}

function cooldownKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

/** Jour civil Europe/Paris (AAAA-MM-JJ). */
function parisCalendarDay(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

function getLastBlagueDay(guildId, userId) {
  const store = loadStore();
  return store[cooldownKey(guildId, userId)] || null;
}

function setLastBlagueDay(guildId, userId, dayKey = parisCalendarDay()) {
  const store = loadStore();
  store[cooldownKey(guildId, userId)] = dayKey;
  saveStore(store);
}

function hasUsedBlagueToday(guildId, userId) {
  const last = getLastBlagueDay(guildId, userId);
  return last === parisCalendarDay();
}

module.exports = {
  parisCalendarDay,
  getLastBlagueDay,
  setLastBlagueDay,
  hasUsedBlagueToday
};
