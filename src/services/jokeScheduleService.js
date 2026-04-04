const fs = require("node:fs");
const path = require("node:path");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const JOKES_PATH = path.join(__dirname, "..", "data", "darkJokes.json");
const STATE_PATH = path.join(__dirname, "..", "data", "jokeRotationState.json");

const DEFAULT_CHANNEL_ID = "454870112141050099";
const DEFAULT_HOURS = [10, 22];

function loadJokes() {
  try {
    const raw = fs.readFileSync(JOKES_PATH, "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return [];
    return arr.filter((j) => j && (j.setup || j.s || j.punchline || j.p));
  } catch {
    return [];
  }
}

function normalizeJoke(j) {
  return {
    setup: String(j.setup || j.s || "").trim(),
    punchline: String(j.punchline || j.p || "").trim(),
    category: String(j.category || j.c || "Noir").trim() || "Noir"
  };
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { queue: [], lastSlot: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function popNextIndex(jokes) {
  const n = jokes.length;
  if (n === 0) return null;
  const state = loadState();
  if (!state.lastSlot) state.lastSlot = {};
  if (!Array.isArray(state.queue) || state.queue.length === 0) {
    state.queue = shuffle([...Array(n).keys()]);
  }
  const idx = state.queue.shift();
  if (state.queue.length === 0) {
    state.queue = shuffle([...Array(n).keys()]);
  }
  saveState(state);
  return idx;
}

function parseHours() {
  const raw = String(process.env.JOKE_SEND_HOURS || "").trim();
  if (raw) {
    const parts = raw.split(/[,;\s]+/).map((x) => parseInt(x, 10)).filter((h) => h >= 0 && h <= 23);
    if (parts.length >= 2) return [...new Set(parts)].sort((a, b) => a - b);
  }
  return DEFAULT_HOURS;
}

function channelId() {
  return String(process.env.JOKE_CHANNEL_ID || DEFAULT_CHANNEL_ID).trim();
}

function isFrozenCheck() {
  try {
    const { isFrozen } = require("./simbotRuntimeService");
    return isFrozen();
  } catch {
    return false;
  }
}

async function sendScheduledJoke(client, slotKey) {
  if (isFrozenCheck()) return;
  const jokesRaw = loadJokes()
    .map(normalizeJoke)
    .filter((j) => j.setup || j.punchline);
  if (jokesRaw.length === 0) {
    console.warn("[JOKES] Catalogue vide (darkJokes.json).");
    return;
  }
  const chId = channelId();
  const channel = await client.channels.fetch(chId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    console.warn(`[JOKES] Salon introuvable ou non texte: ${chId}`);
    return;
  }

  const state = loadState();
  if (!state.lastSlot) state.lastSlot = {};
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}:${slotKey}`;
  if (state.lastSlot[key]) return;
  state.lastSlot[key] = true;
  saveState(state);

  const idx = popNextIndex(jokesRaw);
  if (idx == null || idx < 0 || !jokesRaw[idx]) return;

  const joke = jokesRaw[idx];
  const desc =
    joke.punchline && joke.punchline.length > 0
      ? `**${joke.setup}**\n\n${joke.punchline}`
      : joke.setup.startsWith("—") || joke.setup.includes("\n—")
        ? joke.setup
        : `**${joke.setup}**`;
  const embed = new EmbedBuilder()
    .setColor(0xc27b2e)
    .setDescription(desc)
    .setFooter({ text: `Catégorie : ${joke.category}` })
    .setTimestamp(new Date());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("scheduled_joke_like")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🤍")
      .setLabel("J'aime")
  );

  await channel
    .send({
      embeds: [embed],
      components: [row],
      allowedMentions: { parse: [] }
    })
    .catch((e) => console.error("[JOKES] Envoi:", e?.message || e));
}

function startJokeScheduler(client) {
  stopJokeScheduler(client);
  const hours = parseHours();
  if (hours.length < 1) return;

  let lastMinute = -1;
  client.jokeScheduleInterval = setInterval(() => {
    const now = new Date();
    const m = now.getMinutes();
    if (m === lastMinute) return;
    lastMinute = m;
    if (m !== 0) return;
    const h = now.getHours();
    hours.forEach((targetH, i) => {
      if (h === targetH) {
        sendScheduledJoke(client, `h${targetH}-${i}`).catch(() => null);
      }
    });
  }, 15_000);

  console.log(`[JOKES] Planifie ${hours.join("h et ")}h (locale serveur Node). Salon: ${channelId()}`);
}

function stopJokeScheduler(client) {
  if (client.jokeScheduleInterval) {
    clearInterval(client.jokeScheduleInterval);
    client.jokeScheduleInterval = null;
  }
}

module.exports = {
  startJokeScheduler,
  stopJokeScheduler,
  loadJokes,
  DEFAULT_CHANNEL_ID,
  parseHours
};
