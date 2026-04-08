"use strict";

const config = require("../config");

let voiceMod = null;
let ytdl = null;
let YouTube = null;
let loadOk = false;
let loadErr = null;

function loadDeps() {
  if (voiceMod === false) return false;
  if (loadOk) return true;
  try {
    const ffmpegPath = require("ffmpeg-static");
    if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;
    ytdl = require("@distube/ytdl-core");
    YouTube = require("youtube-sr").default;
    voiceMod = require("@discordjs/voice");
    loadOk = true;
    loadErr = null;
    return true;
  } catch (e) {
    loadErr = e;
    voiceMod = false;
    loadOk = false;
    return false;
  }
}

/** @type {Map<string, { queue: Array<{ title: string, url: string, requesterId: string }>, volume: number, textChannelId: string | null }>} */
const guildStates = new Map();

let spotifyToken = null;
let spotifyTokenExp = 0;

function isEnabled() {
  return Boolean(config.music?.enabled);
}

function getState(guildId) {
  const id = String(guildId);
  if (!guildStates.has(id)) {
    guildStates.set(id, { queue: [], volume: 100, textChannelId: null, player: null, connection: null });
  }
  return guildStates.get(id);
}

function getVoiceChannelForMember(member) {
  const ch = member?.voice?.channel;
  if (!ch?.isVoiceBased?.()) return { error: "Tu dois etre dans un **salon vocal**." };
  return { channel: ch };
}

/**
 * Depuis le panneau vocal prive : le membre doit etre dans le salon session (si defini).
 */
function getVoiceForPrivatePanel(member, client, guildId, ownerId) {
  const base = getVoiceChannelForMember(member);
  if (base.error) return base;
  const s = client.privateRoomSessions?.get(`${guildId}:${ownerId}`);
  if (s?.voiceChannelId && base.channel.id !== s.voiceChannelId) {
    return {
      error: "Connecte-toi dans **ton** salon vocal prive pour utiliser la musique depuis ce panneau."
    };
  }
  return base;
}

async function getSpotifyToken() {
  const cid = config.music?.spotifyClientId;
  const sec = config.music?.spotifyClientSecret;
  if (!cid || !sec) return null;
  const now = Date.now();
  if (spotifyToken && now < spotifyTokenExp - 30_000) return spotifyToken;
  const auth = Buffer.from(`${cid}:${sec}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`
    },
    body: "grant_type=client_credentials"
  });
  if (!res.ok) return null;
  const j = await res.json();
  spotifyToken = j.access_token;
  spotifyTokenExp = now + (j.expires_in || 3600) * 1000;
  return spotifyToken;
}

async function spotifyFetch(path) {
  const token = await getSpotifyToken();
  if (!token) return { error: "Spotify API non configuree (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET dans .env)." };
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { error: `Spotify: ${res.status} ${t.slice(0, 120)}` };
  }
  return { data: await res.json() };
}

async function spotifyFetchAbsolute(fullUrl) {
  const token = await getSpotifyToken();
  if (!token) return { error: "Spotify API non configuree (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET dans .env)." };
  const res = await fetch(fullUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { error: `Spotify: ${res.status} ${t.slice(0, 120)}` };
  }
  return { data: await res.json() };
}

function spotifyMetaFromTrack(tr) {
  if (!tr || tr.is_local) return null;
  const name = tr.name;
  const artist = tr.artists?.[0]?.name || "";
  if (!name) return null;
  return { title: `${artist} — ${name}`, searchQuery: `${artist} ${name}`.trim() };
}

async function youtubeSearchOne(query) {
  const q = String(query || "").trim();
  if (!q) return { error: "Recherche vide." };
  const v = await YouTube.searchOne(q);
  if (!v?.url || !ytdl.validateURL(v.url)) {
    return { error: `Aucun resultat YouTube pour : ${q.slice(0, 80)}` };
  }
  return { title: v.title || q, url: v.url };
}

/**
 * @returns {Promise<{ tracks?: Array<{ title: string, url: string }>, error?: string }>}
 */
async function resolveQueryToYoutubeTracks(query) {
  const raw = String(query || "").trim();
  if (!raw) return { error: "Texte vide." };

  if (ytdl.validateURL(raw)) {
    let info;
    try {
      info = await ytdl.getBasicInfo(raw);
    } catch (e) {
      return { error: `Lien YouTube invalide ou indisponible : ${e.message || e}` };
    }
    const title = info?.videoDetails?.title || "YouTube";
    return { tracks: [{ title, url: raw }] };
  }

  const spotifyPlaylist = raw.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/([a-zA-Z0-9]+)/);
  if (spotifyPlaylist) {
    const id = spotifyPlaylist[1];
    const max = config.music?.maxPlaylistTracks ?? 25;
    const out = [];
    let nextUrl = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=50`;
    while (nextUrl && out.length < max) {
      const page = await spotifyFetchAbsolute(nextUrl);
      if (page.error) return { error: page.error };
      const items = page.data.items || [];
      for (const it of items) {
        const tr = it.track;
        const meta = spotifyMetaFromTrack(tr);
        if (!meta) continue;
        const y = await youtubeSearchOne(meta.searchQuery);
        if (!y.error) out.push({ title: y.title, url: y.url });
        if (out.length >= max) break;
      }
      nextUrl = out.length < max && page.data.next ? page.data.next : null;
    }
    if (!out.length) return { error: "Playlist Spotify vide ou introuvable (ou pas de morceaux resolvables)." };
    return { tracks: out };
  }

  const spotifyAlbum = raw.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?album\/([a-zA-Z0-9]+)/);
  if (spotifyAlbum) {
    const id = spotifyAlbum[1];
    const max = config.music?.maxPlaylistTracks ?? 25;
    const alb = await spotifyFetch(`/albums/${id}`);
    if (alb.error) return { error: alb.error };
    const tracks = alb.data.tracks?.items || [];
    const out = [];
    for (const tr of tracks) {
      const meta = spotifyMetaFromTrack(tr);
      if (!meta) continue;
      const y = await youtubeSearchOne(meta.searchQuery);
      if (!y.error) out.push({ title: y.title, url: y.url });
      if (out.length >= max) break;
    }
    if (!out.length) return { error: "Album Spotify vide ou introuvable." };
    return { tracks: out };
  }

  const spotifyTrack = raw.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)/);
  if (spotifyTrack) {
    const id = spotifyTrack[1];
    const tr = await spotifyFetch(`/tracks/${id}`);
    if (tr.error) return { error: tr.error };
    const meta = spotifyMetaFromTrack(tr.data);
    if (!meta) return { error: "Morceau Spotify introuvable." };
    const y = await youtubeSearchOne(meta.searchQuery);
    if (y.error) return { error: y.error };
    return { tracks: [{ title: y.title, url: y.url }] };
  }

  const y = await youtubeSearchOne(raw);
  if (y.error) return { error: y.error };
  return { tracks: [{ title: y.title, url: y.url }] };
}

async function playNext(guild, failDepth = 0) {
  if (!loadOk || !voiceMod) return;
  if (failDepth > 12) return;
  const st = getState(guild.id);
  if (!st.player || !st.connection) return;
  const next = st.queue.shift();
  if (!next) return;
  try {
    const raw = ytdl(next.url, {
      filter: "audioonly",
      quality: "highestaudio",
      highWaterMark: 1 << 25,
      dlChunkSize: 0
    });
    const { stream, type } = await voiceMod.demuxProbe(raw);
    const resource = voiceMod.createAudioResource(stream, {
      inputType: type,
      inlineVolume: true
    });
    if (resource.volume) resource.volume.setVolume(Math.min(1, Math.max(0, st.volume / 100)));
    st.player.play(resource);
  } catch (e) {
    console.error("[MUSIC] playNext", e?.message || e);
    await playNext(guild, failDepth + 1);
  }
}

function ensurePlayer(guild) {
  const st = getState(guild.id);
  if (st.player) return st.player;
  const { createAudioPlayer, AudioPlayerStatus, NoSubscriberBehavior } = voiceMod;
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play }
  });
  player.on(AudioPlayerStatus.Idle, () => {
    playNext(guild).catch(() => null);
  });
  player.on("error", (err) => {
    console.error("[MUSIC] player error", err?.message || err);
    playNext(guild).catch(() => null);
  });
  st.player = player;
  return player;
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').VoiceBasedChannel} channel
 */
async function joinChannel(guild, channel) {
  if (!loadDeps()) {
    return { error: loadErr?.message ? `Module musique indisponible : ${loadErr.message}` : "Module musique indisponible." };
  }
  const {
    joinVoiceChannel,
    getVoiceConnection,
    VoiceConnectionStatus,
    entersState
  } = voiceMod;

  const existing = getVoiceConnection(guild.id);
  if (existing && existing.joinConfig.channelId === channel.id) {
    const st = getState(guild.id);
    const player = ensurePlayer(guild);
    try {
      existing.subscribe(player);
    } catch {
      /* ignore */
    }
    st.connection = existing;
    return { ok: true, connection: existing };
  }
  if (existing) {
    try {
      existing.destroy();
    } catch {
      /* ignore */
    }
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (e) {
    try {
      connection.destroy();
    } catch {
      /* ignore */
    }
    return { error: `Connexion vocal impossible : ${e.message || e}` };
  }

  const st = getState(guild.id);
  const player = ensurePlayer(guild);
  connection.subscribe(player);
  st.connection = connection;

  connection.on("stateChange", (a, b) => {
    if (b.status === VoiceConnectionStatus.Disconnected) {
      try {
        connection.destroy();
      } catch {
        /* ignore */
      }
      const cur = getState(guild.id);
      if (cur.connection === connection) cur.connection = null;
    }
  });

  return { ok: true, connection };
}

function leaveGuild(guildId) {
  const gid = String(guildId);
  if (loadOk && voiceMod) {
    try {
      voiceMod.getVoiceConnection(gid)?.destroy();
    } catch {
      /* ignore */
    }
  }
  const st = guildStates.get(gid);
  if (st?.player) {
    try {
      st.player.stop(true);
    } catch {
      /* ignore */
    }
    try {
      st.player.removeAllListeners();
    } catch {
      /* ignore */
    }
    st.player = null;
  }
  if (st) {
    st.queue = [];
    st.connection = null;
  }
}

function skipGuild(guildId) {
  if (!loadOk || !voiceMod) return { error: "Musique inactive." };
  const { AudioPlayerStatus } = voiceMod;
  const st = getState(guildId);
  if (!st.player) return { error: "Rien en lecture." };
  const s = st.player.state.status;
  if (s !== AudioPlayerStatus.Playing && s !== AudioPlayerStatus.Buffering) {
    return { error: "Rien en lecture." };
  }
  try {
    st.player.stop(true);
  } catch (e) {
    return { error: e.message || String(e) };
  }
  return { ok: true };
}

function stopGuild(guildId) {
  if (!loadOk || !voiceMod) return { error: "Musique inactive." };
  const st = getState(guildId);
  st.queue = [];
  try {
    st.player?.stop(true);
  } catch {
    /* ignore */
  }
  return { ok: true };
}

function formatQueue(guildId, limit = 10) {
  const st = getState(guildId);
  const lines = st.queue.slice(0, limit).map((t, i) => `${i + 1}. ${t.title}`);
  const extra = st.queue.length > limit ? `\n... et ${st.queue.length - limit} autre(s).` : "";
  if (!lines.length) return "File d'attente vide.";
  return lines.join("\n") + extra;
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} query
 * @param {string} requesterId
 */
async function enqueueQuery(guild, query, requesterId) {
  if (!isEnabled()) return { error: "La musique est desactivee sur ce bot." };
  if (!loadDeps()) {
    return { error: loadErr?.message ? `Module musique : ${loadErr.message}` : "Module musique indisponible." };
  }
  const resolved = await resolveQueryToYoutubeTracks(query);
  if (resolved.error) return { error: resolved.error };
  const st = getState(guild.id);
  const { AudioPlayerStatus } = voiceMod;
  for (const t of resolved.tracks) {
    st.queue.push({ title: t.title, url: t.url, requesterId });
  }
  const status = st.player?.state?.status;
  const idle = !st.player || status === AudioPlayerStatus.Idle;
  if (idle) await playNext(guild);
  const n = resolved.tracks.length;
  return {
    ok: true,
    added: n,
    firstTitle: resolved.tracks[0]?.title,
    queueLen: st.queue.length
  };
}

function destroyAllConnections() {
  if (!loadOk || !voiceMod) {
    guildStates.clear();
    return;
  }
  const { getVoiceConnection } = voiceMod;
  for (const gid of [...guildStates.keys()]) {
    try {
      getVoiceConnection(gid)?.destroy();
    } catch {
      /* ignore */
    }
    const st = guildStates.get(gid);
    if (st?.player) {
      try {
        st.player.stop(true);
        st.player.removeAllListeners();
      } catch {
        /* ignore */
      }
      st.player = null;
    }
  }
  guildStates.clear();
}

module.exports = {
  isEnabled,
  loadDeps,
  getVoiceChannelForMember,
  getVoiceForPrivatePanel,
  joinChannel,
  leaveGuild,
  skipGuild,
  stopGuild,
  formatQueue,
  enqueueQuery,
  resolveQueryToYoutubeTracks,
  destroyAllConnections,
  getState
};
