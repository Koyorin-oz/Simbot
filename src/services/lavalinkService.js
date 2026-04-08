"use strict";

const config = require("../config");
const { Shoukaku, Connectors, LoadType, Constants } = require("shoukaku");

function isLavalinkConfigured() {
  const host = String(config.music?.lavalinkHost || process.env.LAVALINK_HOST || "").trim();
  const auth = String(config.music?.lavalinkPassword || process.env.LAVALINK_PASSWORD || "").trim();
  return Boolean(host && auth);
}

function buildNodeUrl(host, port) {
  const h = String(host).trim();
  if (!h) return "";
  const p = Number(port) || 2333;
  if (/:\d+$/.test(h)) return h;
  return `${h}:${p}`;
}

/**
 * @param {import('discord.js').Client} client
 * @returns {import('shoukaku').Shoukaku | null}
 */
function tryAttachLavalink(client) {
  if (config.music?.forceNativePlayback) return null;
  if (!isLavalinkConfigured()) return null;
  if (client.shoukaku) return client.shoukaku;

  const hostRaw = String(config.music?.lavalinkHost || process.env.LAVALINK_HOST || "").trim();
  const port = Number(config.music?.lavalinkPort || process.env.LAVALINK_PORT || 2333);
  const auth = String(config.music?.lavalinkPassword || process.env.LAVALINK_PASSWORD || "").trim();
  const secure =
    String(process.env.LAVALINK_SECURE || "").toLowerCase() === "true" ||
    config.music?.lavalinkSecure === true;
  const name = String(config.music?.lavalinkNodeName || process.env.LAVALINK_NODE_NAME || "main").trim() || "main";

  const url = buildNodeUrl(hostRaw, port);
  if (!url) return null;

  const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), [{ name, url, auth, secure }], {
    reconnectTries: 5,
    reconnectInterval: 5,
    restTimeout: 60_000
  });
  shoukaku.on("error", (_n, err) => console.error("[LAVALINK]", err?.message || err));
  shoukaku.on("ready", (n) => console.log(`[LAVALINK] Noeud ${n} pret.`));
  client.shoukaku = shoukaku;
  return shoukaku;
}

/**
 * @param {import('shoukaku').Shoukaku | undefined} shoukaku
 * @returns {import('shoukaku').Node | null}
 */
function getConnectedIdealNode(shoukaku) {
  if (!shoukaku) return null;
  const node = shoukaku.getIdealNode();
  if (!node || node.state !== Constants.State.CONNECTED) return null;
  return node;
}

/** Lavalink utilisable pour join + lecture (noeud WebSocket CONNECTED). */
function isLavalinkUsable(client) {
  if (config.music?.forceNativePlayback) return false;
  if (!isLavalinkConfigured() || !client?.shoukaku) return false;
  return Boolean(getConnectedIdealNode(client.shoukaku));
}

function trackToQueueEntry(t) {
  if (!t?.encoded) return null;
  const title = t.info?.title || "Piste";
  let url = String(t.info?.uri || "").trim();
  if (!url && t.info?.identifier) {
    const src = String(t.info.sourceName || "").toLowerCase();
    if (src.includes("youtube")) {
      url = `https://www.youtube.com/watch?v=${t.info.identifier}`;
    }
  }
  if (!url) return null;
  return { title, url };
}

/**
 * Premier morceau encodable (lecture immediate).
 * @param {import('shoukaku').LavalinkResponse | undefined} res
 * @returns {string | null}
 */
function extractEncodedFromResolve(res) {
  if (!res) return null;
  if (res.loadType === LoadType.TRACK) return res.data?.encoded || null;
  if (res.loadType === LoadType.SEARCH) return res.data?.[0]?.encoded || null;
  if (res.loadType === LoadType.PLAYLIST) return res.data?.tracks?.[0]?.encoded || null;
  return null;
}

/**
 * Resolution Lavalink (playlists YouTube / recherche ytsearch / lien direct).
 * Spotify : laisser le chemin play-dl existant (null).
 *
 * @param {import('discord.js').Client} client
 * @param {string} raw
 * @param {number} maxTracks
 * @returns {Promise<{ tracks: Array<{ title: string, url: string }> } | null>}
 */
async function tryResolveQueryWithLavalink(client, raw, maxTracks) {
  if (!isLavalinkUsable(client)) return null;
  const node = getConnectedIdealNode(client.shoukaku);
  if (!node) return null;

  const q = String(raw || "").trim();
  if (!q) return null;
  if (/open\.spotify\.com/i.test(q)) return null;

  let identifier = q;
  if (!/^https?:\/\//i.test(q) && !/^ytsearch:/i.test(q) && !/^ytmsearch:/i.test(q)) {
    identifier = `ytsearch:${q}`;
  }

  let res;
  try {
    res = await node.rest.resolve(identifier);
  } catch (e) {
    console.warn("[LAVALINK] resolve", e?.message || e);
    return null;
  }
  if (!res) return null;

  const out = [];
  if (res.loadType === LoadType.TRACK) {
    const e = trackToQueueEntry(res.data);
    if (e) out.push(e);
  } else if (res.loadType === LoadType.SEARCH) {
    for (const t of res.data || []) {
      const e = trackToQueueEntry(t);
      if (e) out.push(e);
      if (out.length >= maxTracks) break;
    }
  } else if (res.loadType === LoadType.PLAYLIST) {
    for (const t of res.data?.tracks || []) {
      const e = trackToQueueEntry(t);
      if (e) out.push(e);
      if (out.length >= maxTracks) break;
    }
  } else {
    return null;
  }

  if (!out.length) return null;
  return { tracks: out };
}

module.exports = {
  isLavalinkConfigured,
  isLavalinkUsable,
  tryAttachLavalink,
  getConnectedIdealNode,
  tryResolveQueryWithLavalink,
  extractEncodedFromResolve,
  LoadType
};
