const crypto = require("crypto");

const TTL_MS = 1000 * 60 * 60 * 48;
const PREFIX = "blague_reveal:";

function ensureStore(client) {
  if (!client.blagueRevealStore) client.blagueRevealStore = new Map();
  return client.blagueRevealStore;
}

function pruneStore(store) {
  const now = Date.now();
  for (const [k, v] of store) {
    if (!v || v.expires < now) store.delete(k);
  }
}

/**
 * @param {import("discord.js").Client} client
 * @param {{ setup: string; punchline: string; category: string }} payload
 * @returns {string} token for customId (without prefix)
 */
function storePunchline(client, payload) {
  const store = ensureStore(client);
  pruneStore(store);
  const token = crypto.randomBytes(16).toString("hex");
  store.set(token, {
    setup: payload.setup,
    punchline: payload.punchline,
    category: payload.category,
    expires: Date.now() + TTL_MS
  });
  return token;
}

/**
 * @param {import("discord.js").Client} client
 * @param {string} token
 * @returns {{ setup: string; punchline: string; category: string } | null}
 */
function consumePunchline(client, token) {
  if (!token || typeof token !== "string") return null;
  const store = ensureStore(client);
  pruneStore(store);
  const data = store.get(token);
  if (!data || data.expires < Date.now()) return null;
  store.delete(token);
  return {
    setup: data.setup,
    punchline: data.punchline,
    category: data.category
  };
}

function revealCustomId(token) {
  return `${PREFIX}${token}`;
}

function parseRevealCustomId(customId) {
  if (!customId || !customId.startsWith(PREFIX)) return null;
  return customId.slice(PREFIX.length);
}

module.exports = {
  storePunchline,
  consumePunchline,
  revealCustomId,
  parseRevealCustomId,
  REVEAL_PREFIX: PREFIX
};
